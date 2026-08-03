const PWA_UPDATE_CHANNEL_NAME = "folo-pwa-update-v1"
const PWA_UPDATE_DEFERRED_KEY = "folo-pwa-update-deferred-v1"

export type PwaUpdateBroadcastMessage =
  | { type: "update-started" }
  | { type: "update-completed" }
  | { type: "update-failed"; error: string }

let periodicUpdateIntervalId: ReturnType<typeof setInterval> | null = null

export function deferPwaUpdateForSession(): void {
  sessionStorage.setItem(PWA_UPDATE_DEFERRED_KEY, "1")
}

export function isPwaUpdateDeferredForSession(): boolean {
  return sessionStorage.getItem(PWA_UPDATE_DEFERRED_KEY) === "1"
}

export function clearDeferredPwaUpdateForSession(): void {
  sessionStorage.removeItem(PWA_UPDATE_DEFERRED_KEY)
}

export function createPwaUpdateChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null
  }

  return new BroadcastChannel(PWA_UPDATE_CHANNEL_NAME)
}

export function broadcastPwaUpdateMessage(message: PwaUpdateBroadcastMessage): void {
  const channel = createPwaUpdateChannel()
  channel?.postMessage(message)
  channel?.close()
}

export function registerPeriodicServiceWorkerCheck(
  period: number,
  swUrl: string,
  registration: ServiceWorkerRegistration,
): () => void {
  if (period <= 0) {
    return () => {}
  }

  if (periodicUpdateIntervalId) {
    clearInterval(periodicUpdateIntervalId)
  }

  periodicUpdateIntervalId = setInterval(async () => {
    if ("onLine" in navigator && !navigator.onLine) {
      return
    }

    try {
      const response = await fetch(swUrl, {
        cache: "no-store",
        headers: {
          cache: "no-store",
          "cache-control": "no-cache",
        },
      })

      if (response.status === 200) {
        await registration.update()
      }
    } catch (error) {
      console.error("[PWA] Service worker update check failed:", error)
    }
  }, period)

  return () => {
    if (periodicUpdateIntervalId) {
      clearInterval(periodicUpdateIntervalId)
      periodicUpdateIntervalId = null
    }
  }
}
