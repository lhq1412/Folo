const PWA_UPDATE_CHANNEL_NAME = "folo-pwa-update-v1"
const PWA_UPDATE_DEFERRED_KEY = "folo-pwa-update-deferred-v1"

export type PwaUpdateBroadcastMessage =
  | { type: "deferred"; updateId: string }
  | { type: "update-started"; updateId: string }
  | { type: "update-completed"; updateId: string }
  | { type: "update-failed"; updateId: string; error: string }

let currentPwaUpdateId: string | null = null

export function beginPwaUpdateCycle(): string {
  currentPwaUpdateId = crypto.randomUUID()
  return currentPwaUpdateId
}

export function getCurrentPwaUpdateId(): string | null {
  return currentPwaUpdateId
}

export function isMatchingPwaUpdateId(updateId: string): boolean {
  return currentPwaUpdateId === updateId
}

export function deferPwaUpdateForSession(updateId?: string): void {
  sessionStorage.setItem(PWA_UPDATE_DEFERRED_KEY, updateId ?? "1")
}

export function isPwaUpdateDeferredForSession(updateId?: string | null): boolean {
  const stored = sessionStorage.getItem(PWA_UPDATE_DEFERRED_KEY)
  if (!stored) {
    return false
  }

  if (updateId) {
    return stored === updateId
  }

  return stored === "1" || stored.length > 0
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

export function broadcastPwaUpdateDeferred(updateId: string): void {
  deferPwaUpdateForSession(updateId)
  broadcastPwaUpdateMessage({ type: "deferred", updateId })
}

export function registerPeriodicServiceWorkerCheck(
  period: number,
  swUrl: string,
  registration: ServiceWorkerRegistration,
): () => void {
  if (period <= 0) {
    return () => {}
  }

  const intervalId = setInterval(async () => {
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
    clearInterval(intervalId)
  }
}
