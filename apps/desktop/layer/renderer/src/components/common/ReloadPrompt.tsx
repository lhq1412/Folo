import i18n from "i18next"
import { useEffect, useRef } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

import { setUpdaterStatus } from "~/atoms/updater"
import { detectUnsavedWork } from "~/lib/pwa/unsaved-work-guard"
import type { PwaUpdateBroadcastMessage } from "~/lib/pwa/update-coordinator"
import {
  broadcastPwaUpdateMessage,
  clearDeferredPwaUpdateForSession,
  createPwaUpdateChannel,
  deferPwaUpdateForSession,
  isPwaUpdateDeferredForSession,
  registerPeriodicServiceWorkerCheck,
} from "~/lib/pwa/update-coordinator"

const UPDATE_CHECK_PERIOD_MS = 60 * 60 * 1000
let pwaUpdateStarted = false

export function ReloadPrompt() {
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)

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

      if (registration.active?.state === "activated") {
        registerPeriodicServiceWorkerCheck(UPDATE_CHECK_PERIOD_MS, swUrl, registration)
        return
      }

      registration.installing?.addEventListener("statechange", (event) => {
        const worker = event.target as ServiceWorker
        if (worker.state === "activated") {
          registerPeriodicServiceWorkerCheck(UPDATE_CHECK_PERIOD_MS, swUrl, registration)
        }
      })
    },
  })

  updateServiceWorkerRef.current = updateServiceWorker

  useEffect(() => {
    const channel = createPwaUpdateChannel()
    if (!channel) {
      return
    }

    const handleMessage = (event: MessageEvent<PwaUpdateBroadcastMessage>) => {
      if (event.data.type === "update-started") {
        setUpdaterStatus({
          type: "pwa",
          status: "updating",
        })
      }

      if (event.data.type === "update-failed") {
        setUpdaterStatus({
          type: "pwa",
          status: "failed",
          error: event.data.error,
        })
      }
    }

    channel.addEventListener("message", handleMessage)
    return () => {
      channel.removeEventListener("message", handleMessage)
      channel.close()
    }
  }, [])

  useEffect(() => {
    if (!needRefresh || pwaUpdateStarted) {
      return
    }

    if (isPwaUpdateDeferredForSession()) {
      setUpdaterStatus({
        type: "pwa",
        status: "deferred",
        finishUpdate: async () => {
          await performPwaUpdate(updateServiceWorkerRef.current)
        },
        deferUpdate: () => {
          deferPwaUpdateForSession()
          setUpdaterStatus({
            type: "pwa",
            status: "deferred",
            finishUpdate: async () => {
              await performPwaUpdate(updateServiceWorkerRef.current)
            },
            deferUpdate: () => {
              deferPwaUpdateForSession()
            },
          })
        },
      })
      return
    }

    setUpdaterStatus({
      type: "pwa",
      status: "ready",
      finishUpdate: async () => {
        await performPwaUpdate(updateServiceWorkerRef.current)
      },
      deferUpdate: () => {
        deferPwaUpdateForSession()
        setUpdaterStatus({
          type: "pwa",
          status: "deferred",
          finishUpdate: async () => {
            await performPwaUpdate(updateServiceWorkerRef.current)
          },
          deferUpdate: () => {
            deferPwaUpdateForSession()
          },
        })
      },
    })
  }, [needRefresh])

  return null
}

async function performPwaUpdate(
  updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null,
): Promise<void> {
  if (!updateServiceWorker || pwaUpdateStarted) {
    return
  }

  const unsavedWork = detectUnsavedWork()
  if (unsavedWork.hasUnsavedWork) {
    const confirmed = window.confirm(i18n.t("app.pwa.update_unsaved_confirm"))
    if (!confirmed) {
      deferPwaUpdateForSession()
      setUpdaterStatus({
        type: "pwa",
        status: "deferred",
        finishUpdate: async () => {
          await performPwaUpdate(updateServiceWorker)
        },
        deferUpdate: () => {
          deferPwaUpdateForSession()
        },
      })
      return
    }
  }

  pwaUpdateStarted = true
  clearDeferredPwaUpdateForSession()
  broadcastPwaUpdateMessage({ type: "update-started" })

  setUpdaterStatus({
    type: "pwa",
    status: "updating",
  })

  try {
    await updateServiceWorker(true)
    broadcastPwaUpdateMessage({ type: "update-completed" })
  } catch (error) {
    pwaUpdateStarted = false
    const message = error instanceof Error ? error.message : String(error)
    broadcastPwaUpdateMessage({ type: "update-failed", error: message })
    setUpdaterStatus({
      type: "pwa",
      status: "failed",
      error: message,
      finishUpdate: async () => {
        await performPwaUpdate(updateServiceWorker)
      },
      deferUpdate: () => {
        deferPwaUpdateForSession()
        setUpdaterStatus({
          type: "pwa",
          status: "deferred",
        })
      },
    })
  }
}
