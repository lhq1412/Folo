import i18n from "i18next"
import type { RefObject } from "react"
import { useEffect, useRef } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

import { setUpdaterStatus } from "~/atoms/updater"
import { logPwaUpdateDiagnostic } from "~/lib/pwa/pwa-update-diagnostics"
import { createPwaUpdaterStatus } from "~/lib/pwa/pwa-updater"
import { detectUnsavedWork } from "~/lib/pwa/unsaved-work-guard"
import type {
  PwaUpdateBroadcastMessage,
  PwaUpdateLifecycleRecord,
} from "~/lib/pwa/update-coordinator"
import {
  acceptPwaUpdateId,
  broadcastPwaUpdateMessage,
  clearDeferredPwaUpdateForSession,
  consumePwaUpdateCompletion,
  createPwaUpdateChannel,
  deferPwaUpdateForSession,
  getCurrentPwaUpdateId,
  hasProcessedLifecycleCompletion,
  hydratePwaUpdateState,
  isBroadcastGenerationCurrent,
  isPwaUpdateDeferredForSession,
  isValidPwaUpdateLifecycleRecord,
  logStaleBroadcastMessage,
  logStaleFinishClosure,
  markLifecycleCompletionProcessed,
  markPwaUpdateCompleted,
  PwaUpdateIdentityUnavailableError,
  registerPeriodicServiceWorkerCheck,
  registerPwaUpdateStorageSync,
  registerServiceWorkerUpdateListener,
  resolvePwaUpdateId,
} from "~/lib/pwa/update-coordinator"

const UPDATE_CHECK_PERIOD_MS = 60 * 60 * 1000
let pwaUpdateStarted = false

export function resetPwaUpdateSessionForTests(): void {
  pwaUpdateStarted = false
}

export function ReloadPrompt() {
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const cleanupPeriodicCheckRef = useRef<(() => void) | null>(null)
  const cleanupWorkerListenerRef = useRef<(() => void) | null>(null)
  const cleanupUpdateListenerRef = useRef<(() => void) | null>(null)
  const currentUpdateIdRef = useRef<string | null>(null)
  const needRefreshRef = useRef(false)
  const reconcileLoopRef = useRef<Promise<void> | null>(null)
  const reconcilePendingRef = useRef(false)
  const reconcilePwaUpdateRef = useRef<(() => Promise<void>) | null>(null)

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

      cleanupUpdateListenerRef.current?.()
      cleanupUpdateListenerRef.current = registerServiceWorkerUpdateListener(registration, () => {
        void reconcilePwaUpdateRef.current?.()
      })

      const startPeriodicCheck = () => {
        cleanupPeriodicCheckRef.current?.()
        cleanupPeriodicCheckRef.current = registerPeriodicServiceWorkerCheck(
          UPDATE_CHECK_PERIOD_MS,
          swUrl,
          registration,
          () => {
            void reconcilePwaUpdateRef.current?.()
          },
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

  reconcilePwaUpdateRef.current = async () => {
    if (!needRefreshRef.current || pwaUpdateStarted) {
      return
    }

    reconcilePendingRef.current = true

    if (!reconcileLoopRef.current) {
      reconcileLoopRef.current = (async () => {
        while (reconcilePendingRef.current) {
          reconcilePendingRef.current = false

          const registration =
            registrationRef.current ?? (await navigator.serviceWorker?.getRegistration()) ?? null

          try {
            const updateId = await resolvePwaUpdateId(registration)

            if (pwaUpdateStarted) {
              return
            }

            if (reconcilePendingRef.current) {
              continue
            }

            currentUpdateIdRef.current = updateId

            const finishUpdate = createFinishUpdateHandler(
              updateId,
              updateServiceWorkerRef,
              registrationRef,
              reconcilePwaUpdateRef,
            )

            setUpdaterStatus(
              createPwaUpdaterStatus(
                isPwaUpdateDeferredForSession(updateId) ? "deferred" : "ready",
                finishUpdate,
                { updateId },
              ),
            )
          } catch (error) {
            if (error instanceof PwaUpdateIdentityUnavailableError) {
              if (pwaUpdateStarted) {
                return
              }

              setUpdaterStatus(
                createPwaUpdaterStatus(
                  "failed",
                  async () => {
                    await reconcilePwaUpdateRef.current?.()
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
      })().finally(() => {
        reconcileLoopRef.current = null
      })
    }

    await reconcileLoopRef.current

    if (reconcilePendingRef.current) {
      await reconcilePwaUpdateRef.current?.()
    }
  }

  const handleRemoteUpdateCompleted = (updateId: string) => {
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

  const handleLifecycleCompletion = async (record: PwaUpdateLifecycleRecord | null) => {
    if (!record || pwaUpdateStarted) {
      return
    }

    if (!isValidPwaUpdateLifecycleRecord(record)) {
      return
    }

    if (hasProcessedLifecycleCompletion(record.nonce)) {
      logPwaUpdateDiagnostic({
        event: "pwa_update_completion_consumed",
        result: "duplicate",
        updateId: record.updateId,
        generation: record.generation ?? 0,
      })
      return
    }

    const consumption = await consumePwaUpdateCompletion(record)
    if (consumption !== "accepted") {
      return
    }

    markLifecycleCompletionProcessed(record.nonce)
    currentUpdateIdRef.current = record.updateId
    handleRemoteUpdateCompleted(record.updateId)
  }

  const syncUpdaterStatusFromStorage = () => {
    if (pwaUpdateStarted || !needRefreshRef.current) {
      return
    }

    const updateId = getCurrentPwaUpdateId()
    if (!updateId) {
      return
    }

    currentUpdateIdRef.current = updateId

    const finishUpdate = async () => {
      const updateId = getCurrentPwaUpdateId()
      if (!updateId) {
        return
      }

      await createFinishUpdateHandler(
        updateId,
        updateServiceWorkerRef,
        registrationRef,
        reconcilePwaUpdateRef,
      )()
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
    void hydratePwaUpdateState()
  }, [])

  useEffect(() => {
    const cleanupStorageSync = registerPwaUpdateStorageSync({
      onActiveUpdateIdChanged: () => {
        syncUpdaterStatusFromStorage()
      },
      onDeferredStateChanged: () => {
        syncUpdaterStatusFromStorage()
      },
      onLifecycleChanged: (record) => {
        void handleLifecycleCompletion(record)
      },
    })
    return cleanupStorageSync
  }, [])

  useEffect(() => {
    const channel = createPwaUpdateChannel()
    if (!channel) {
      return
    }

    const finishUpdate = createFinishUpdateHandler(
      () => currentUpdateIdRef.current,
      updateServiceWorkerRef,
      registrationRef,
      reconcilePwaUpdateRef,
    )

    const handleMessage = async (event: MessageEvent<PwaUpdateBroadcastMessage>) => {
      const message = event.data

      if (!(await isBroadcastGenerationCurrent(message.generation))) {
        logStaleBroadcastMessage(message.type, message.generation)
        return
      }

      if (message.type === "update-completed") {
        if (pwaUpdateStarted) {
          setUpdaterStatus(null)
          return
        }

        await handleLifecycleCompletion({
          updateId: message.updateId,
          state: "completed",
          completedAt: message.completedAt,
          nonce: message.nonce,
          generation: message.generation,
        })
        return
      }

      if (!(await acceptPwaUpdateId(message.updateId))) {
        return
      }

      currentUpdateIdRef.current = message.updateId

      switch (message.type) {
        case "deferred": {
          await deferPwaUpdateForSession(message.updateId)
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

    const dispatchMessage = (event: MessageEvent<PwaUpdateBroadcastMessage>) => {
      void handleMessage(event)
    }

    channel.addEventListener("message", dispatchMessage)
    return () => {
      channel.removeEventListener("message", dispatchMessage)
      channel.close()
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupPeriodicCheckRef.current?.()
      cleanupPeriodicCheckRef.current = null
      cleanupWorkerListenerRef.current?.()
      cleanupWorkerListenerRef.current = null
      cleanupUpdateListenerRef.current?.()
      cleanupUpdateListenerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!needRefresh || pwaUpdateStarted) {
      return
    }

    void reconcilePwaUpdateRef.current?.()
  }, [needRefresh])

  return null
}

function createFinishUpdateHandler(
  updateIdOrGetter: string | (() => string | null),
  updateServiceWorkerRef: RefObject<((reloadPage?: boolean) => Promise<void>) | null>,
  registrationRef: RefObject<ServiceWorkerRegistration | null>,
  reconcilePwaUpdateRef: RefObject<(() => Promise<void>) | null>,
): () => Promise<void> {
  return async () => {
    const updateId = typeof updateIdOrGetter === "function" ? updateIdOrGetter() : updateIdOrGetter
    if (!updateId) {
      return
    }

    const registration =
      registrationRef.current ?? (await navigator.serviceWorker?.getRegistration()) ?? null

    try {
      const canonicalUpdateId = await resolvePwaUpdateId(registration)
      if (canonicalUpdateId !== updateId) {
        logStaleFinishClosure(updateId)
        void reconcilePwaUpdateRef.current?.()
        return
      }
    } catch (error) {
      if (error instanceof PwaUpdateIdentityUnavailableError) {
        void reconcilePwaUpdateRef.current?.()
        return
      }

      throw error
    }

    await performPwaUpdate(updateServiceWorkerRef.current, updateId, registration, () => {
      void reconcilePwaUpdateRef.current?.()
    })
  }
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
  registration?: ServiceWorkerRegistration | null,
  onStaleBatch?: () => void,
): Promise<void> {
  if (!updateServiceWorker || pwaUpdateStarted) {
    return
  }

  const activeUpdateId = updateId ?? getCurrentPwaUpdateId()
  if (!activeUpdateId) {
    return
  }

  const resolvedRegistration =
    registration ?? (await navigator.serviceWorker?.getRegistration()) ?? null

  const unsavedWork = detectUnsavedWork()
  if (unsavedWork.hasUnsavedWork) {
    const confirmed = window.confirm(i18n.t("app.pwa.update_unsaved_confirm"))
    if (!confirmed) {
      await deferPwaUpdateForSession(activeUpdateId)
      setUpdaterStatus(
        createPwaUpdaterStatus(
          "deferred",
          () =>
            performPwaUpdate(
              updateServiceWorker,
              activeUpdateId,
              resolvedRegistration,
              onStaleBatch,
            ),
          {
            updateId: activeUpdateId,
          },
        ),
      )
      broadcastPwaUpdateMessage({ type: "deferred", updateId: activeUpdateId })
      return
    }
  }

  try {
    const canonicalUpdateId = await resolvePwaUpdateId(resolvedRegistration)
    if (canonicalUpdateId !== activeUpdateId) {
      logStaleFinishClosure(activeUpdateId)
      onStaleBatch?.()
      return
    }
  } catch (error) {
    if (error instanceof PwaUpdateIdentityUnavailableError) {
      onStaleBatch?.()
      return
    }

    throw error
  }

  pwaUpdateStarted = true
  await clearDeferredPwaUpdateForSession()
  broadcastPwaUpdateMessage({ type: "update-started", updateId: activeUpdateId })

  setUpdaterStatus({
    type: "pwa",
    status: "updating",
  })

  try {
    await updateServiceWorker(true)
    const record = await markPwaUpdateCompleted(activeUpdateId)
    const consumption = await consumePwaUpdateCompletion(record)
    if (consumption === "accepted") {
      broadcastPwaUpdateMessage({
        type: "update-completed",
        updateId: activeUpdateId,
        nonce: record.nonce,
        completedAt: record.completedAt,
        generation: record.generation,
      })
    }
  } catch (error) {
    pwaUpdateStarted = false
    const message = error instanceof Error ? error.message : String(error)
    broadcastPwaUpdateMessage({ type: "update-failed", updateId: activeUpdateId, error: message })
    setUpdaterStatus(
      createPwaUpdaterStatus(
        "failed",
        () =>
          performPwaUpdate(updateServiceWorker, activeUpdateId, resolvedRegistration, onStaleBatch),
        {
          error: message,
          updateId: activeUpdateId,
        },
      ),
    )
  }
}
