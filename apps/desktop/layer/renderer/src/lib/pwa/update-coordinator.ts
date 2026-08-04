import type { PwaBuildRevisionResponseMessage } from "./pwa-sw-messages"
import { PWA_BUILD_REVISION_REQUEST, PWA_BUILD_REVISION_RESPONSE } from "./pwa-sw-messages"

const PWA_UPDATE_CHANNEL_NAME = "folo-pwa-update-v1"
export const PWA_UPDATE_DEFERRED_KEY = "folo-pwa-update-deferred-v1"
export const PWA_ACTIVE_UPDATE_ID_KEY = "folo-pwa-active-update-id-v1"
export const PWA_UPDATE_LIFECYCLE_KEY = "folo-pwa-update-lifecycle-v1"
const PWA_UPDATE_CLAIM_LOCK = "folo-pwa-update-claim-v1"
const REVISION_REQUEST_TIMEOUT_MS = 2000
const REVISION_RETRY_ATTEMPTS = 3
const REVISION_RETRY_BASE_DELAY_MS = 250

export type PwaUpdateBroadcastMessage =
  | { type: "deferred"; updateId: string }
  | { type: "update-started"; updateId: string }
  | { type: "update-completed"; updateId: string; nonce: string; completedAt: number }
  | { type: "update-failed"; updateId: string; error: string }

export type PwaUpdateStorageSyncHandlers = {
  onActiveUpdateIdChanged?: (updateId: string | null) => void
  onDeferredStateChanged?: () => void
  onLifecycleChanged?: (record: PwaUpdateLifecycleRecord | null) => void
}

type DeferredUpdateRecord = {
  updateId: string
  deferredAt: number
}

export type PwaUpdateLifecycleRecord = {
  updateId: string
  state: "completed"
  completedAt: number
  nonce: string
}

export const PWA_UPDATE_LIFECYCLE_TTL_MS = 5 * 60 * 1000
const PWA_PROCESSED_LIFECYCLE_KEY = "folo-pwa-processed-lifecycle-v1"

export class PwaUpdateIdentityUnavailableError extends Error {
  constructor() {
    super("PWA update identity unavailable")
    this.name = "PwaUpdateIdentityUnavailableError"
  }
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

function invalidateStaleLifecycleRecord(activeUpdateId: string): void {
  const record = readPwaUpdateLifecycleRecord()
  if (record && record.updateId !== activeUpdateId) {
    clearPwaUpdateLifecycleRecord()
  }
}

function claimFallbackUpdateIdSync(): string {
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

async function claimFallbackUpdateId(): Promise<string> {
  const claim = () => claimFallbackUpdateIdSync()

  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request(PWA_UPDATE_CLAIM_LOCK, claim)
  }

  return claim()
}

export function createPwaUpdateIdFromWaitingWorker(
  scriptUrl: string,
  buildRevision: string,
): string {
  return `sw:${scriptUrl}#${buildRevision}`
}

export async function requestWaitingWorkerBuildRevision(
  worker: ServiceWorker,
  timeoutMs = REVISION_REQUEST_TIMEOUT_MS,
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

export async function requestWaitingWorkerBuildRevisionWithRetry(
  worker: ServiceWorker,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<string | null> {
  const attempts = options?.attempts ?? REVISION_RETRY_ATTEMPTS
  const baseDelayMs = options?.baseDelayMs ?? REVISION_RETRY_BASE_DELAY_MS

  for (let attempt = 0; attempt < attempts; attempt++) {
    const revision = await requestWaitingWorkerBuildRevision(worker)
    if (revision) {
      return revision
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, baseDelayMs * (attempt + 1))
      })
    }
  }

  return null
}

export async function resolvePwaUpdateId(
  registration?: ServiceWorkerRegistration | null,
  options?: { buildRevision?: string },
): Promise<string> {
  const waitingWorker = registration?.waiting
  if (waitingWorker) {
    const buildRevision =
      options?.buildRevision ?? (await requestWaitingWorkerBuildRevisionWithRetry(waitingWorker))
    if (buildRevision) {
      const updateId = createPwaUpdateIdFromWaitingWorker(waitingWorker.scriptURL, buildRevision)
      invalidateStaleLifecycleRecord(updateId)
      clearStaleDeferredForUpdateId(updateId)
      persistPwaUpdateId(updateId)
      return updateId
    }

    throw new PwaUpdateIdentityUnavailableError()
  }

  return claimFallbackUpdateId()
}

export function beginPwaUpdateCycle(): string {
  return claimFallbackUpdateIdSync()
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

export function shouldAcceptPwaUpdateCompletion(updateId: string): boolean {
  const activeUpdateId = getCurrentPwaUpdateId()
  if (!activeUpdateId) {
    return true
  }

  return activeUpdateId === updateId
}

export function isMatchingPwaUpdateId(updateId: string): boolean {
  return getCurrentPwaUpdateId() === updateId
}

export function clearActivePwaUpdateId(): void {
  currentPwaUpdateId = null
  localStorage.removeItem(PWA_ACTIVE_UPDATE_ID_KEY)
}

export function clearActivePwaUpdateIdIfMatching(updateId: string): boolean {
  const activeUpdateId = getCurrentPwaUpdateId()
  if (activeUpdateId && activeUpdateId !== updateId) {
    return false
  }

  clearActivePwaUpdateId()
  return true
}

export function resetPwaUpdateCoordinatorForTests(): void {
  currentPwaUpdateId = null
  localStorage.removeItem(PWA_ACTIVE_UPDATE_ID_KEY)
  localStorage.removeItem(PWA_UPDATE_DEFERRED_KEY)
  localStorage.removeItem(PWA_UPDATE_LIFECYCLE_KEY)
  sessionStorage.removeItem(PWA_PROCESSED_LIFECYCLE_KEY)
}

export function markPwaUpdateCompleted(updateId: string): PwaUpdateLifecycleRecord {
  const record: PwaUpdateLifecycleRecord = {
    updateId,
    state: "completed",
    completedAt: Date.now(),
    nonce: crypto.randomUUID(),
  }
  localStorage.setItem(PWA_UPDATE_LIFECYCLE_KEY, JSON.stringify(record))
  return record
}

export function parsePwaUpdateLifecycleRecord(raw: string | null): PwaUpdateLifecycleRecord | null {
  if (!raw) {
    return null
  }

  try {
    const record = JSON.parse(raw) as PwaUpdateLifecycleRecord
    if (record.state !== "completed" || !record.updateId || !record.nonce) {
      return null
    }

    return record
  } catch {
    return null
  }
}

export function readPwaUpdateLifecycleRecord(): PwaUpdateLifecycleRecord | null {
  return parsePwaUpdateLifecycleRecord(localStorage.getItem(PWA_UPDATE_LIFECYCLE_KEY))
}

export function isValidPwaUpdateLifecycleRecord(record: PwaUpdateLifecycleRecord): boolean {
  return Date.now() - record.completedAt < PWA_UPDATE_LIFECYCLE_TTL_MS
}

function readProcessedLifecycleNonces(): Set<string> {
  const raw = sessionStorage.getItem(PWA_PROCESSED_LIFECYCLE_KEY)
  if (!raw) {
    return new Set()
  }

  try {
    const nonces = JSON.parse(raw) as string[]
    return new Set(nonces)
  } catch {
    return new Set()
  }
}

function writeProcessedLifecycleNonces(nonces: Set<string>): void {
  sessionStorage.setItem(PWA_PROCESSED_LIFECYCLE_KEY, JSON.stringify([...nonces]))
}

export function hasProcessedLifecycleCompletion(nonce: string): boolean {
  return readProcessedLifecycleNonces().has(nonce)
}

export function markLifecycleCompletionProcessed(nonce: string): void {
  const nonces = readProcessedLifecycleNonces()
  nonces.add(nonce)
  writeProcessedLifecycleNonces(nonces)
}

export function clearPwaUpdateLifecycleRecord(): void {
  localStorage.removeItem(PWA_UPDATE_LIFECYCLE_KEY)
}

export function clearPwaUpdateLifecycleRecordIfMatching(record: PwaUpdateLifecycleRecord): boolean {
  const existing = readPwaUpdateLifecycleRecord()
  if (!existing) {
    return false
  }

  if (existing.updateId !== record.updateId || existing.nonce !== record.nonce) {
    return false
  }

  clearPwaUpdateLifecycleRecord()
  return true
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

export function registerPwaUpdateStorageSync(handlers?: PwaUpdateStorageSyncHandlers): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PWA_ACTIVE_UPDATE_ID_KEY) {
      currentPwaUpdateId = event.newValue
      handlers?.onActiveUpdateIdChanged?.(event.newValue)
    }

    if (event.key === PWA_UPDATE_DEFERRED_KEY) {
      handlers?.onDeferredStateChanged?.()
    }

    if (event.key === PWA_UPDATE_LIFECYCLE_KEY) {
      handlers?.onLifecycleChanged?.(parsePwaUpdateLifecycleRecord(event.newValue))
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
  onUpdateChecked?: () => void,
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
        onUpdateChecked?.()
      }
    } catch (error) {
      console.error("[PWA] Service worker update check failed:", error)
    }
  }, period)

  return () => {
    clearInterval(intervalId)
  }
}

export function registerServiceWorkerUpdateListener(
  registration: ServiceWorkerRegistration,
  onWaitingWorkerReady: () => void,
): () => void {
  if (typeof registration.addEventListener !== "function") {
    return () => {}
  }

  const handleInstallingWorker = (worker: ServiceWorker) => {
    const handleStateChange = () => {
      if (worker.state === "installed" && registration.waiting) {
        onWaitingWorkerReady()
      }
    }

    worker.addEventListener("statechange", handleStateChange)
    return () => {
      worker.removeEventListener("statechange", handleStateChange)
    }
  }

  let cleanupInstallingListener: (() => void) | null = null

  const handleUpdateFound = () => {
    cleanupInstallingListener?.()
    const installingWorker = registration.installing
    if (!installingWorker) {
      return
    }

    cleanupInstallingListener = handleInstallingWorker(installingWorker)
  }

  registration.addEventListener("updatefound", handleUpdateFound)

  return () => {
    registration.removeEventListener("updatefound", handleUpdateFound)
    cleanupInstallingListener?.()
    cleanupInstallingListener = null
  }
}
