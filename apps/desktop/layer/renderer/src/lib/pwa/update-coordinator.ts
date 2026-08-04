import type { PwaBuildRevisionResponseMessage } from "./pwa-sw-messages"
import { PWA_BUILD_REVISION_REQUEST, PWA_BUILD_REVISION_RESPONSE } from "./pwa-sw-messages"
import { logPwaUpdateDiagnostic } from "./pwa-update-diagnostics"
import type {
  ConsumePwaUpdateCompletionResult,
  PwaUpdateLifecycleRecord,
} from "./update-state-store"
import {
  adoptPwaUpdateId as adoptPwaUpdateIdInStore,
  claimFallbackPwaUpdateId,
  clearDeferredPwaUpdateInStore,
  consumePwaUpdateCompletionInStore,
  deferPwaUpdateInStore,
  getCachedActivePwaUpdateId,
  getCachedPwaUpdateGeneration,
  hydratePwaUpdateState,
  isPwaUpdateDeferredInStore,
  isValidCompletionRecord,
  persistCanonicalPwaUpdateId,
  PWA_UPDATE_LIFECYCLE_TTL_MS,
  PWA_UPDATE_SIGNAL_KEY,
  readCompletedLifecycleRecord,
  refreshPwaUpdateState,
  resetPwaUpdateStateStoreForTests,
  setPauseDuringPwaStateMutationForTests,
  writePwaUpdateCompleted,
} from "./update-state-store"

/**
 * PWA update coordinator state machine (IndexedDB is the source of truth):
 *
 * | State            | Trigger                         | Next state        |
 * |------------------|---------------------------------|-------------------|
 * | idle             | waiting worker detected         | active(updateId)  |
 * | active           | defer                           | active+deferred   |
 * | active           | update-started (local/remote)   | updating          |
 * | updating         | SW activation succeeds          | completed tombstone|
 * | completed        | TTL expiry                      | idle              |
 * | active/completed | newer canonical updateId        | active(newId)     |
 *
 * BroadcastChannel and localStorage signal keys only notify tabs to re-read IDB.
 */

const PWA_UPDATE_CHANNEL_NAME = "folo-pwa-update-v1"
export const PWA_UPDATE_DEFERRED_KEY = "folo-pwa-update-deferred-v1"
export const PWA_ACTIVE_UPDATE_ID_KEY = "folo-pwa-active-update-id-v1"
export const PWA_UPDATE_LIFECYCLE_KEY = "folo-pwa-update-lifecycle-v1"
const PWA_PROCESSED_LIFECYCLE_KEY = "folo-pwa-processed-lifecycle-v1"

export type { ConsumePwaUpdateCompletionResult, PwaUpdateLifecycleRecord }
export { PWA_UPDATE_LIFECYCLE_TTL_MS, PWA_UPDATE_SIGNAL_KEY }

export function setPauseDuringPwaUpdateStateMutationForTests(
  pause: (() => void | Promise<void>) | null,
): void {
  setPauseDuringPwaStateMutationForTests(pause)
}

export async function withPwaUpdateStateLock<T>(operation: () => T | Promise<T>): Promise<T> {
  // IndexedDB mutations are serialized via enqueueMutation; Web Locks are optional
  // and must not wrap store mutations to avoid cross-tab deadlocks in tests/browsers.
  return Promise.resolve(operation())
}

async function ensureHydrated(): Promise<void> {
  await hydratePwaUpdateState()
}

const REVISION_REQUEST_TIMEOUT_MS = 2000
const REVISION_RETRY_ATTEMPTS = 3
const REVISION_RETRY_BASE_DELAY_MS = 250

export type PwaUpdateBroadcastMessage =
  | { type: "deferred"; updateId: string; generation: number }
  | { type: "update-started"; updateId: string; generation: number }
  | {
      type: "update-completed"
      updateId: string
      nonce: string
      completedAt: number
      generation: number
    }
  | { type: "update-failed"; updateId: string; error: string; generation: number }

export type PwaUpdateBroadcastMessageInput =
  | { type: "deferred"; updateId: string; generation?: number }
  | { type: "update-started"; updateId: string; generation?: number }
  | {
      type: "update-completed"
      updateId: string
      nonce: string
      completedAt: number
      generation?: number
    }
  | { type: "update-failed"; updateId: string; error: string; generation?: number }

export type PwaUpdateStorageSyncHandlers = {
  onActiveUpdateIdChanged?: (updateId: string | null) => void
  onDeferredStateChanged?: () => void
  onLifecycleChanged?: (record: PwaUpdateLifecycleRecord | null) => void
  onStateSignal?: () => void
}

export class PwaUpdateIdentityUnavailableError extends Error {
  constructor() {
    super("PWA update identity unavailable")
    this.name = "PwaUpdateIdentityUnavailableError"
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
  await ensureHydrated()

  const waitingWorker = registration?.waiting
  if (waitingWorker) {
    const buildRevision =
      options?.buildRevision ?? (await requestWaitingWorkerBuildRevisionWithRetry(waitingWorker))
    if (buildRevision) {
      const updateId = createPwaUpdateIdFromWaitingWorker(waitingWorker.scriptURL, buildRevision)
      return withPwaUpdateStateLock(() => persistCanonicalPwaUpdateId(updateId))
    }

    logPwaUpdateDiagnostic({
      event: "pwa_update_revision_handshake_failed",
      generation: getCachedPwaUpdateGeneration(),
    })
    throw new PwaUpdateIdentityUnavailableError()
  }

  return withPwaUpdateStateLock(() => claimFallbackPwaUpdateId())
}

export async function beginPwaUpdateCycle(): Promise<string> {
  await ensureHydrated()
  return withPwaUpdateStateLock(() => claimFallbackPwaUpdateId())
}

export function getCurrentPwaUpdateId(): string | null {
  return getCachedActivePwaUpdateId()
}

export async function acceptPwaUpdateId(updateId: string): Promise<boolean> {
  await ensureHydrated()
  const accepted = await withPwaUpdateStateLock(() => adoptPwaUpdateIdInStore(updateId))
  if (!accepted) {
    logPwaUpdateDiagnostic({
      event: "pwa_update_adoption_conflict",
      updateId,
      generation: getCachedPwaUpdateGeneration(),
    })
  }

  return accepted
}

export { persistCanonicalPwaUpdateId }

export function shouldAcceptPwaUpdateCompletion(updateId: string): boolean {
  const activeUpdateId = getCurrentPwaUpdateId()
  if (!activeUpdateId) {
    const tombstone = readCompletedLifecycleRecord()
    if (!tombstone) {
      return true
    }

    return tombstone.updateId === updateId
  }

  return activeUpdateId === updateId
}

export async function consumePwaUpdateCompletion(
  record: PwaUpdateLifecycleRecord,
): Promise<ConsumePwaUpdateCompletionResult> {
  await ensureHydrated()
  const result = await withPwaUpdateStateLock(() => consumePwaUpdateCompletionInStore(record))
  logPwaUpdateDiagnostic({
    event: "pwa_update_completion_consumed",
    result,
    updateId: record.updateId,
    generation: record.generation ?? getCachedPwaUpdateGeneration(),
  })

  return result
}

export function isMatchingPwaUpdateId(updateId: string): boolean {
  return getCurrentPwaUpdateId() === updateId
}

export async function resetPwaUpdateCoordinatorForTests(): Promise<void> {
  sessionStorage.removeItem(PWA_PROCESSED_LIFECYCLE_KEY)
  await resetPwaUpdateStateStoreForTests()
}

export async function markPwaUpdateCompleted(updateId: string): Promise<PwaUpdateLifecycleRecord> {
  await ensureHydrated()
  return withPwaUpdateStateLock(() => writePwaUpdateCompleted(updateId))
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
  return readCompletedLifecycleRecord()
}

export function isValidPwaUpdateLifecycleRecord(record: PwaUpdateLifecycleRecord): boolean {
  return isValidCompletionRecord(record)
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

export async function deferPwaUpdateForSession(updateId?: string): Promise<void> {
  await ensureHydrated()
  await withPwaUpdateStateLock(() => deferPwaUpdateInStore(updateId ?? "1"))
}

export function isPwaUpdateDeferredForSession(updateId?: string | null): boolean {
  return isPwaUpdateDeferredInStore(updateId)
}

export async function clearDeferredPwaUpdateForSession(): Promise<void> {
  await ensureHydrated()
  await withPwaUpdateStateLock(() => clearDeferredPwaUpdateInStore())
}

export function broadcastPwaUpdateDeferred(updateId: string): void {
  void deferPwaUpdateForSession(updateId).then(() => {
    broadcastPwaUpdateMessage({ type: "deferred", updateId })
  })
}

export function registerPwaUpdateStorageSync(handlers?: PwaUpdateStorageSyncHandlers): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PWA_UPDATE_SIGNAL_KEY) {
      void refreshPwaUpdateState().then(() => {
        handlers?.onStateSignal?.()
        handlers?.onActiveUpdateIdChanged?.(getCurrentPwaUpdateId())
        handlers?.onDeferredStateChanged?.()
        handlers?.onLifecycleChanged?.(readPwaUpdateLifecycleRecord())
      })
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

export function broadcastPwaUpdateMessage(message: PwaUpdateBroadcastMessageInput): void {
  const envelope = {
    ...message,
    generation: message.generation ?? getCachedPwaUpdateGeneration(),
  } as PwaUpdateBroadcastMessage

  const channel = createPwaUpdateChannel()
  if (!channel) {
    logPwaUpdateDiagnostic({
      event: "pwa_update_no_bc_fallback",
      channel: "storage",
      generation: envelope.generation,
    })
  }

  channel?.postMessage(envelope)
  channel?.close()
}

export async function isBroadcastGenerationCurrent(generation?: number): Promise<boolean> {
  if (generation === undefined) {
    return true
  }

  await refreshPwaUpdateState()
  if (generation < getCachedPwaUpdateGeneration()) {
    return false
  }

  return true
}

export function logStaleBroadcastMessage(messageType: string, messageGeneration: number): void {
  logPwaUpdateDiagnostic({
    event: "pwa_update_broadcast_stale",
    messageType,
    messageGeneration,
    generation: getCachedPwaUpdateGeneration(),
  })
}

export function logStaleFinishClosure(updateId: string): void {
  logPwaUpdateDiagnostic({
    event: "pwa_update_stale_finish_closure",
    updateId,
    generation: getCachedPwaUpdateGeneration(),
  })
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

export {
  hydratePwaUpdateState,
  isValidTombstone,
  refreshPwaUpdateState,
  toLifecycleRecord,
} from "./update-state-store"
