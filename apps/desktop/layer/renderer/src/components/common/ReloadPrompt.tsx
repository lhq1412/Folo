import i18n from "i18next"
import { useEffect, useRef } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

import { setUpdaterStatus } from "~/atoms/updater"
import { createPwaUpdaterStatus } from "~/lib/pwa/pwa-updater"
import { detectUnsavedWork } from "~/lib/pwa/unsaved-work-guard"
import type { PwaUpdateBroadcastMessage } from "~/lib/pwa/update-coordinator"
import {
  acceptPwaUpdateId,
  broadcastPwaUpdateMessage,
  clearActivePwaUpdateId,
  clearDeferredPwaUpdateForSession,
  createPwaUpdateChannel,
  deferPwaUpdateForSession,
  getCurrentPwaUpdateId,
  isPwaUpdateDeferredForSession,
  PwaUpdateIdentityUnavailableError,
  registerPeriodicServiceWorkerCheck,
  registerPwaUpdateStorageSync,
  resolvePwaUpdateId,
} from "~/lib/pwa/update-coordinator"

const UPDATE_CHECK_PERIOD_MS = 60 * 60 * 1000
let pwaUpdateStarted = false

export function ReloadPrompt() {
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const cleanupPeriodicCheckRef = useRef<(() => void) | null>(null)
  const cleanupWorkerListenerRef = useRef<(() => void) | null>(null)
  const currentUpdateIdRef = useRef<string | null>(null)
  const needRefreshRef = useRef(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("[PWA] Service worker registration failed:", error)
      setUpdaterStatus({
        type: "pwa",
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      })
    },
    onRegisteredSW(swUrl, registration) {
      registrationRef.current = registration ?? null
      if (!registration) {
        return
      }

      const startPeriodicCheck = () => {
        cleanupPeriodicCheckRef.current?.()
        cleanupPeriodicCheckRef.current = registerPeriodicServiceWorkerCheck(
          UPDATE_CHECK_PERIOD_MS,
          swUrl,
          registration,
        )
      }

      if (registration.active?.state === "activated") {
        startPeriodicCheck()
        return
      }

      const installingWorker = registration.installing
      if (!installingWorker) {
        return
      }

      const handleStateChange = (event: Event) => {
        const worker = event.target as ServiceWorker
        if (worker.state === "activated") {
          startPeriodicCheck()
        }
      }

      installingWorker.addEventListener("statechange", handleStateChange)
      cleanupWorkerListenerRef.current = () => {
        installingWorker.removeEventListener("statechange", handleStateChange)
      }
    },
  })

  updateServiceWorkerRef.current = updateServiceWorker
  needRefreshRef.current = needRefresh

  const syncUpdaterStatusFromStorage = () => {
    if (!needRefreshRef.current || pwaUpdateStarted) {
      return
    }

    const updateId = getCurrentPwaUpdateId()
    if (!updateId) {
      return
    }

    currentUpdateIdRef.current = updateId

    const finishUpdate = async () => {
      await performPwaUpdate(updateServiceWorkerRef.current, updateId)
    }

    setUpdaterStatus(
      createPwaUpdaterStatus(
        isPwaUpdateDeferredForSession(updateId) ? "deferred" : "ready",
        finishUpdate,
        { updateId },
      ),
    )
  }

  useEffect(() => {
    const cleanupStorageSync = registerPwaUpdateStorageSync({
      onActiveUpdateIdChanged: () => {
        syncUpdaterStatusFromStorage()
      },
      onDeferredStateChanged: () => {
        syncUpdaterStatusFromStorage()
      },
    })
    return cleanupStorageSync
  }, [])

  useEffect(() => {
    const channel = createPwaUpdateChannel()
    if (!channel) {
      return
    }

    const finishUpdate = async () => {
      await performPwaUpdate(updateServiceWorkerRef.current, currentUpdateIdRef.current)
    }

    const handleMessage = (event: MessageEvent<PwaUpdateBroadcastMessage>) => {
      const message = event.data
      if (!acceptPwaUpdateId(message.updateId)) {
        return
      }

      currentUpdateIdRef.current = message.updateId

      switch (message.type) {
        case "deferred": {
          deferPwaUpdateForSession(message.updateId)
          setUpdaterStatus(
            createPwaUpdaterStatus("deferred", finishUpdate, { updateId: message.updateId }),
          )
          break
        }
        case "update-started": {
          setUpdaterStatus({
            type: "pwa",
            status: "updating",
          })
          break
        }
        case "update-completed": {
          clearActivePwaUpdateId()
          if (pwaUpdateStarted) {
            setUpdaterStatus(null)
            break
          }

          handleRemoteUpdateCompleted(message.updateId)
          break
        }
        case "update-failed": {
          setUpdaterStatus(
            createPwaUpdaterStatus("failed", finishUpdate, {
              error: message.error,
              updateId: message.updateId,
            }),
          )
          break
        }
      }
    }

    channel.addEventListener("message", handleMessage)
    return () => {
      channel.removeEventListener("message", handleMessage)
      channel.close()
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupPeriodicCheckRef.current?.()
      cleanupPeriodicCheckRef.current = null
      cleanupWorkerListenerRef.current?.()
      cleanupWorkerListenerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!needRefresh || pwaUpdateStarted) {
      return
    }

    let cancelled = false

    const applyNeedRefresh = async () => {
      const registration =
        registrationRef.current ?? (await navigator.serviceWorker?.getRegistration()) ?? null
      if (cancelled) {
        return
      }

      try {
        const updateId = await resolvePwaUpdateId(registration)
        currentUpdateIdRef.current = updateId

        const finishUpdate = async () => {
          await performPwaUpdate(updateServiceWorkerRef.current, updateId)
        }

        setUpdaterStatus(
          createPwaUpdaterStatus(
            isPwaUpdateDeferredForSession(updateId) ? "deferred" : "ready",
            finishUpdate,
            { updateId },
          ),
        )
      } catch (error) {
        if (error instanceof PwaUpdateIdentityUnavailableError) {
          setUpdaterStatus(
            createPwaUpdaterStatus(
              "failed",
              async () => {
                await applyNeedRefresh()
              },
              {
                error: i18n.t("app.pwa.update_identity_unavailable"),
              },
            ),
          )
          return
        }

        throw error
      }
    }

    void applyNeedRefresh()

    return () => {
      cancelled = true
    }
  }, [needRefresh])

  return null
}

function handleRemoteUpdateCompleted(updateId: string): void {
  const reloadPage = createReloadPageHandler()

  if (detectUnsavedWork().hasUnsavedWork) {
    setUpdaterStatus(
      createPwaUpdaterStatus("ready", reloadPage, {
        updateId,
        reloadOnly: true,
      }),
    )
    return
  }

  void reloadPage()
}

function createReloadPageHandler(): () => Promise<void> {
  return async () => {
    const unsavedWork = detectUnsavedWork()
    if (unsavedWork.hasUnsavedWork) {
      const confirmed = window.confirm(i18n.t("app.pwa.update_unsaved_confirm"))
      if (!confirmed) {
        return
      }
    }

    window.location.reload()
  }
}

async function performPwaUpdate(
  updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null,
  updateId: string | null,
): Promise<void> {
  if (!updateServiceWorker || pwaUpdateStarted) {
    return
  }

  const activeUpdateId = updateId ?? getCurrentPwaUpdateId()
  if (!activeUpdateId) {
    return
  }

  const unsavedWork = detectUnsavedWork()
  if (unsavedWork.hasUnsavedWork) {
    const confirmed = window.confirm(i18n.t("app.pwa.update_unsaved_confirm"))
    if (!confirmed) {
      deferPwaUpdateForSession(activeUpdateId)
      setUpdaterStatus(
        createPwaUpdaterStatus(
          "deferred",
          () => performPwaUpdate(updateServiceWorker, activeUpdateId),
          {
            updateId: activeUpdateId,
          },
        ),
      )
      broadcastPwaUpdateMessage({ type: "deferred", updateId: activeUpdateId })
      return
    }
  }

  pwaUpdateStarted = true
  clearDeferredPwaUpdateForSession()
  broadcastPwaUpdateMessage({ type: "update-started", updateId: activeUpdateId })

  setUpdaterStatus({
    type: "pwa",
    status: "updating",
  })

  try {
    await updateServiceWorker(true)
    clearActivePwaUpdateId()
    broadcastPwaUpdateMessage({ type: "update-completed", updateId: activeUpdateId })
  } catch (error) {
    pwaUpdateStarted = false
    const message = error instanceof Error ? error.message : String(error)
    broadcastPwaUpdateMessage({ type: "update-failed", updateId: activeUpdateId, error: message })
    setUpdaterStatus(
      createPwaUpdaterStatus(
        "failed",
        () => performPwaUpdate(updateServiceWorker, activeUpdateId),
        {
          error: message,
          updateId: activeUpdateId,
        },
      ),
    )
  }
}
