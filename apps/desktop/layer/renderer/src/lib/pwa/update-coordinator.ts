const PWA_UPDATE_CHANNEL_NAME = "folo-pwa-update-v1"
const PWA_UPDATE_DEFERRED_KEY = "folo-pwa-update-deferred-v1"
const PWA_ACTIVE_UPDATE_ID_KEY = "folo-pwa-active-update-id-v1"

export type PwaUpdateBroadcastMessage =
  | { type: "deferred"; updateId: string }
  | { type: "update-started"; updateId: string }
  | { type: "update-completed"; updateId: string }
  | { type: "update-failed"; updateId: string; error: string }

type DeferredUpdateRecord = {
  updateId: string
  deferredAt: number
}

let currentPwaUpdateId: string | null = null

function readPersistedPwaUpdateId(): string | null {
  return localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)
}

function persistPwaUpdateId(updateId: string): void {
  currentPwaUpdateId = updateId
  localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, updateId)
}

function readDeferredRecord(): DeferredUpdateRecord | null {
  const raw = sessionStorage.getItem(PWA_UPDATE_DEFERRED_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as DeferredUpdateRecord
  } catch {
    return {
      updateId: raw,
      deferredAt: Date.now(),
    }
  }
}

function writeDeferredRecord(record: DeferredUpdateRecord): void {
  sessionStorage.setItem(PWA_UPDATE_DEFERRED_KEY, JSON.stringify(record))
}

function clearStaleDeferredForUpdateId(updateId: string): void {
  const record = readDeferredRecord()
  if (record && record.updateId !== updateId) {
    clearDeferredPwaUpdateForSession()
  }
}

export function createPwaUpdateIdFromWaitingWorker(
  scriptUrl: string,
  contentRevision: string,
): string {
  return `sw:${scriptUrl}#${contentRevision}`
}

export async function hashServiceWorkerContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16)
}

async function getWaitingServiceWorkerContentRevision(
  worker: ServiceWorker,
): Promise<string | null> {
  try {
    const response = await fetch(worker.scriptURL, {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
      },
    })

    if (!response.ok) {
      return null
    }

    const content = await response.text()
    return await hashServiceWorkerContent(content)
  } catch {
    return null
  }
}

export async function resolvePwaUpdateId(
  registration?: ServiceWorkerRegistration | null,
  options?: { contentRevision?: string },
): Promise<string> {
  const waitingWorker = registration?.waiting
  if (waitingWorker) {
    const contentRevision =
      options?.contentRevision ?? (await getWaitingServiceWorkerContentRevision(waitingWorker))
    if (contentRevision) {
      const updateId = createPwaUpdateIdFromWaitingWorker(waitingWorker.scriptURL, contentRevision)
      clearStaleDeferredForUpdateId(updateId)
      persistPwaUpdateId(updateId)
      return updateId
    }
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
  sessionStorage.removeItem(PWA_UPDATE_DEFERRED_KEY)
}

export function deferPwaUpdateForSession(updateId?: string): void {
  writeDeferredRecord({
    updateId: updateId ?? "1",
    deferredAt: Date.now(),
  })
}

export function isPwaUpdateDeferredForSession(updateId?: string | null): boolean {
  const record = readDeferredRecord()
  if (!record) {
    return false
  }

  if (updateId) {
    return record.updateId === updateId
  }

  return record.updateId.length > 0
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
