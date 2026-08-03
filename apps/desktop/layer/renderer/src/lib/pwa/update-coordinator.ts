import type { PwaBuildRevisionResponseMessage } from "./pwa-sw-messages"
import { PWA_BUILD_REVISION_REQUEST, PWA_BUILD_REVISION_RESPONSE } from "./pwa-sw-messages"

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

function syncCurrentPwaUpdateIdFromStorage(): string | null {
  const persistedUpdateId = readPersistedPwaUpdateId()
  if (persistedUpdateId) {
    currentPwaUpdateId = persistedUpdateId
  }

  return persistedUpdateId
}

function persistPwaUpdateId(updateId: string): void {
  currentPwaUpdateId = updateId
  localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, updateId)
}

function readDeferredRecord(): DeferredUpdateRecord | null {
  const raw = localStorage.getItem(PWA_UPDATE_DEFERRED_KEY)
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
  localStorage.setItem(PWA_UPDATE_DEFERRED_KEY, JSON.stringify(record))
}

function clearStaleDeferredForUpdateId(updateId: string): void {
  const record = readDeferredRecord()
  if (record && record.updateId !== updateId) {
    clearDeferredPwaUpdateForSession()
  }
}

export function createPwaUpdateIdFromWaitingWorker(
  scriptUrl: string,
  buildRevision: string,
): string {
  return `sw:${scriptUrl}#${buildRevision}`
}

export async function requestWaitingWorkerBuildRevision(
  worker: ServiceWorker,
  timeoutMs = 2000,
): Promise<string | null> {
  if (typeof MessageChannel === "undefined") {
    return null
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timeoutId = setTimeout(() => {
      channel.port1.close()
      resolve(null)
    }, timeoutMs)

    channel.port1.onmessage = (event: MessageEvent<PwaBuildRevisionResponseMessage>) => {
      clearTimeout(timeoutId)
      channel.port1.close()

      const message = event.data
      if (message?.type === PWA_BUILD_REVISION_RESPONSE && message.revision) {
        resolve(message.revision)
        return
      }

      resolve(null)
    }

    try {
      worker.postMessage({ type: PWA_BUILD_REVISION_REQUEST }, [channel.port2])
    } catch {
      clearTimeout(timeoutId)
      channel.port1.close()
      resolve(null)
    }
  })
}

export async function resolvePwaUpdateId(
  registration?: ServiceWorkerRegistration | null,
  options?: { buildRevision?: string },
): Promise<string> {
  const waitingWorker = registration?.waiting
  if (waitingWorker) {
    const buildRevision =
      options?.buildRevision ?? (await requestWaitingWorkerBuildRevision(waitingWorker))
    if (buildRevision) {
      const updateId = createPwaUpdateIdFromWaitingWorker(waitingWorker.scriptURL, buildRevision)
      clearStaleDeferredForUpdateId(updateId)
      persistPwaUpdateId(updateId)
      return updateId
    }
  }

  return beginPwaUpdateCycle()
}

export function beginPwaUpdateCycle(): string {
  const persistedUpdateId = syncCurrentPwaUpdateIdFromStorage()
  if (persistedUpdateId) {
    return persistedUpdateId
  }

  const candidateUpdateId = crypto.randomUUID()
  localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, candidateUpdateId)
  const resolvedUpdateId = syncCurrentPwaUpdateIdFromStorage() ?? candidateUpdateId
  currentPwaUpdateId = resolvedUpdateId
  return resolvedUpdateId
}

export function getCurrentPwaUpdateId(): string | null {
  return syncCurrentPwaUpdateIdFromStorage() ?? currentPwaUpdateId
}

export function acceptPwaUpdateId(updateId: string): boolean {
  const persistedUpdateId = syncCurrentPwaUpdateIdFromStorage()
  const activeUpdateId = persistedUpdateId ?? currentPwaUpdateId

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
  localStorage.removeItem(PWA_UPDATE_DEFERRED_KEY)
}

export function registerPwaUpdateStorageSync(): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PWA_ACTIVE_UPDATE_ID_KEY) {
      currentPwaUpdateId = event.newValue
    }
  }

  window.addEventListener("storage", handleStorage)
  return () => {
    window.removeEventListener("storage", handleStorage)
  }
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
