const PWA_UPDATE_CHANNEL_NAME = "folo-pwa-update-v1"
const PWA_UPDATE_DEFERRED_KEY = "folo-pwa-update-deferred-v1"
const PWA_ACTIVE_UPDATE_ID_KEY = "folo-pwa-active-update-id-v1"

export type PwaUpdateBroadcastMessage =
  | { type: "deferred"; updateId: string }
  | { type: "update-started"; updateId: string }
  | { type: "update-completed"; updateId: string }
  | { type: "update-failed"; updateId: string; error: string }

let currentPwaUpdateId: string | null = null

function readPersistedPwaUpdateId(): string | null {
  return localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)
}

function persistPwaUpdateId(updateId: string): void {
  currentPwaUpdateId = updateId
  localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, updateId)
}

export function createPwaUpdateIdFromWaitingWorker(scriptUrl: string): string {
  return `sw:${scriptUrl}`
}

export function resolvePwaUpdateId(registration?: ServiceWorkerRegistration | null): string {
  const waitingScriptUrl = registration?.waiting?.scriptURL
  if (waitingScriptUrl) {
    const updateId = createPwaUpdateIdFromWaitingWorker(waitingScriptUrl)
    persistPwaUpdateId(updateId)
    return updateId
  }

  return beginPwaUpdateCycle()
}

export function beginPwaUpdateCycle(): string {
  const persistedUpdateId = readPersistedPwaUpdateId()
  if (persistedUpdateId) {
    currentPwaUpdateId = persistedUpdateId
    return persistedUpdateId
  }

  const updateId = crypto.randomUUID()
  persistPwaUpdateId(updateId)
  return updateId
}

export function getCurrentPwaUpdateId(): string | null {
  return currentPwaUpdateId ?? readPersistedPwaUpdateId()
}

export function acceptPwaUpdateId(updateId: string): boolean {
  const activeUpdateId = getCurrentPwaUpdateId()
  if (activeUpdateId && activeUpdateId !== updateId) {
    return false
  }

  persistPwaUpdateId(updateId)
  return true
}

export function isMatchingPwaUpdateId(updateId: string): boolean {
  return getCurrentPwaUpdateId() === updateId
}

export function clearActivePwaUpdateId(): void {
  currentPwaUpdateId = null
  localStorage.removeItem(PWA_ACTIVE_UPDATE_ID_KEY)
}

export function resetPwaUpdateCoordinatorForTests(): void {
  currentPwaUpdateId = null
  localStorage.removeItem(PWA_ACTIVE_UPDATE_ID_KEY)
  localStorage.removeItem(PWA_UPDATE_DEFERRED_KEY)
}

export function deferPwaUpdateForSession(updateId?: string): void {
  localStorage.setItem(PWA_UPDATE_DEFERRED_KEY, updateId ?? "1")
}

export function isPwaUpdateDeferredForSession(updateId?: string | null): boolean {
  const stored = localStorage.getItem(PWA_UPDATE_DEFERRED_KEY)
  if (!stored) {
    return false
  }

  if (updateId) {
    return stored === updateId
  }

  return stored === "1" || stored.length > 0
}

export function clearDeferredPwaUpdateForSession(): void {
  localStorage.removeItem(PWA_UPDATE_DEFERRED_KEY)
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
