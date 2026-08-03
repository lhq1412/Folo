import i18n from "i18next"
import { useEffect, useRef } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

import { setUpdaterStatus } from "~/atoms/updater"
import { createPwaUpdaterStatus } from "~/lib/pwa/pwa-updater"
import { detectUnsavedWork } from "~/lib/pwa/unsaved-work-guard"
import type { PwaUpdateBroadcastMessage } from "~/lib/pwa/update-coordinator"
import {
  acceptPwaUpdateId,
  beginPwaUpdateCycle,
  broadcastPwaUpdateMessage,
  clearActivePwaUpdateId,
  clearDeferredPwaUpdateForSession,
  createPwaUpdateChannel,
  deferPwaUpdateForSession,
  getCurrentPwaUpdateId,
  isPwaUpdateDeferredForSession,
  registerPeriodicServiceWorkerCheck,
} from "~/lib/pwa/update-coordinator"

const UPDATE_CHECK_PERIOD_MS = 60 * 60 * 1000
let pwaUpdateStarted = false

export function ReloadPrompt() {
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const cleanupPeriodicCheckRef = useRef<(() => void) | null>(null)
  const cleanupWorkerListenerRef = useRef<(() => void) | null>(null)
  const currentUpdateIdRef = useRef<string | null>(null)

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
          if (!pwaUpdateStarted) {
            window.location.reload()
          } else {
            setUpdaterStatus(null)
          }
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

    const updateId = getCurrentPwaUpdateId() ?? beginPwaUpdateCycle()
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
  }, [needRefresh])

  return null
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
