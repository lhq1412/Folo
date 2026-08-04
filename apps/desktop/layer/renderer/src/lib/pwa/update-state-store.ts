import { promisifyRequest } from "idb-keyval"

const DB_NAME = "folo-pwa-update-state-v1"
const STORE_NAME = "coordinator"
const STATE_KEY = "state"

export const PWA_UPDATE_SIGNAL_KEY = "folo-pwa-update-signal-v2"

export const PWA_UPDATE_LIFECYCLE_TTL_MS = 5 * 60 * 1000

const LEGACY_MIGRATION_VERSION = 1

export type PwaUpdateLifecycleRecord = {
  updateId: string
  state: "completed"
  completedAt: number
  nonce: string
  generation?: number
}

export type PwaUpdateCompletedTombstone = {
  updateId: string
  generation: number
  nonce: string
  completedAt: number
}

export type PwaUpdateDeferredState = {
  updateId: string
  deferredAt: number
  generation: number
}

export type PwaUpdateStateRecord = {
  schemaVersion: 2
  generation: number
  activeUpdateId: string | null
  deferred: PwaUpdateDeferredState | null
  completed: PwaUpdateCompletedTombstone | null
  legacyMigrationVersion: number
}

export type ConsumePwaUpdateCompletionResult = "accepted" | "stale" | "expired"

export type CompletePwaUpdateParams = {
  updateId: string
  expectedGeneration: number
}

export type CompletePwaUpdateOutcome =
  { result: "accepted"; record: PwaUpdateLifecycleRecord } | { result: "stale" }

const LEGACY_ACTIVE_KEY = "folo-pwa-active-update-id-v1"
const LEGACY_DEFERRED_KEY = "folo-pwa-update-deferred-v1"
const LEGACY_LIFECYCLE_KEY = "folo-pwa-update-lifecycle-v1"

let databasePromise: Promise<IDBDatabase> | null = null
let openDatabaseInstance: IDBDatabase | null = null
let mutationQueue: Promise<unknown> = Promise.resolve()
let cachedState: PwaUpdateStateRecord | null = null
let pauseDuringMutationForTests: (() => void | Promise<void>) | null = null

export function setPauseDuringPwaStateMutationForTests(
  pause: (() => void | Promise<void>) | null,
): void {
  pauseDuringMutationForTests = pause
}

function defaultState(): PwaUpdateStateRecord {
  return {
    schemaVersion: 2,
    generation: 0,
    activeUpdateId: null,
    deferred: null,
    completed: null,
    legacyMigrationVersion: 0,
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME)
      }
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open PWA update state database"))
      }
      request.onsuccess = () => {
        openDatabaseInstance = request.result
        resolve(request.result)
      }
    })
  }

  return databasePromise
}

function readLegacyLifecycleRecord(): PwaUpdateLifecycleRecord | null {
  const raw = localStorage.getItem(LEGACY_LIFECYCLE_KEY)
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

function migrateFromLegacyStorage(): PwaUpdateStateRecord {
  const state = defaultState()
  state.generation = 1
  state.legacyMigrationVersion = LEGACY_MIGRATION_VERSION

  const activeUpdateId = localStorage.getItem(LEGACY_ACTIVE_KEY)
  if (activeUpdateId) {
    state.activeUpdateId = activeUpdateId
  }

  const deferredRaw = localStorage.getItem(LEGACY_DEFERRED_KEY)
  if (deferredRaw) {
    try {
      const deferred = JSON.parse(deferredRaw) as { updateId: string; deferredAt: number }
      state.deferred = {
        updateId: deferred.updateId,
        deferredAt: deferred.deferredAt,
        generation: state.generation,
      }
    } catch {
      state.deferred = {
        updateId: deferredRaw,
        deferredAt: Date.now(),
        generation: state.generation,
      }
    }
  }

  const lifecycle = readLegacyLifecycleRecord()
  if (lifecycle && isValidCompletionRecord(lifecycle)) {
    state.completed = {
      updateId: lifecycle.updateId,
      generation: state.generation,
      nonce: lifecycle.nonce,
      completedAt: lifecycle.completedAt,
    }
  }

  return state
}

function normalizePersistedState(existing: PwaUpdateStateRecord): PwaUpdateStateRecord {
  if (existing.schemaVersion === 2) {
    return existing
  }

  if (existing.schemaVersion === 1) {
    return {
      ...existing,
      schemaVersion: 2,
      legacyMigrationVersion: existing.legacyMigrationVersion ?? LEGACY_MIGRATION_VERSION,
    }
  }

  return defaultState()
}

function resolveInitialState(existing: PwaUpdateStateRecord | undefined): PwaUpdateStateRecord {
  if (existing) {
    return normalizePersistedState(existing)
  }

  return migrateFromLegacyStorage()
}

function emitStateSignal(): void {
  try {
    localStorage.setItem(PWA_UPDATE_SIGNAL_KEY, crypto.randomUUID())
  } catch {
    // Ignore quota errors in private mode.
  }
}

function syncLegacyStorageMirror(state: PwaUpdateStateRecord): void {
  if (state.activeUpdateId) {
    localStorage.setItem(LEGACY_ACTIVE_KEY, state.activeUpdateId)
  } else {
    localStorage.removeItem(LEGACY_ACTIVE_KEY)
  }

  if (state.deferred) {
    localStorage.setItem(
      LEGACY_DEFERRED_KEY,
      JSON.stringify({
        updateId: state.deferred.updateId,
        deferredAt: state.deferred.deferredAt,
      }),
    )
  } else {
    localStorage.removeItem(LEGACY_DEFERRED_KEY)
  }

  if (state.completed && isValidTombstone(state.completed)) {
    localStorage.setItem(
      LEGACY_LIFECYCLE_KEY,
      JSON.stringify({
        updateId: state.completed.updateId,
        state: "completed",
        completedAt: state.completed.completedAt,
        nonce: state.completed.nonce,
      } satisfies PwaUpdateLifecycleRecord),
    )
  } else {
    localStorage.removeItem(LEGACY_LIFECYCLE_KEY)
  }
}

function updateCachedStateFromRead(state: PwaUpdateStateRecord): void {
  cachedState = state
  syncLegacyStorageMirror(state)
}

function applyCachedState(state: PwaUpdateStateRecord): void {
  cachedState = state
  syncLegacyStorageMirror(state)
  emitStateSignal()
}

async function readPersistedState(db: IDBDatabase): Promise<PwaUpdateStateRecord | null> {
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const existing = (await promisifyRequest(store.get(STATE_KEY))) as
    PwaUpdateStateRecord | undefined

  if (!existing) {
    return null
  }

  return normalizePersistedState(existing)
}

function runReadWriteTransaction<T>(
  db: IDBDatabase,
  mutator: (state: PwaUpdateStateRecord) => T,
): Promise<{ state: PwaUpdateStateRecord; result: T }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    let transactionState: PwaUpdateStateRecord
    let transactionResult: T

    const getRequest = store.get(STATE_KEY)

    getRequest.onsuccess = () => {
      const existing = getRequest.result as PwaUpdateStateRecord | undefined
      transactionState = resolveInitialState(existing)
      transactionResult = mutator(transactionState)
      store.put(transactionState, STATE_KEY)
    }

    tx.oncomplete = () => {
      resolve({ state: transactionState, result: transactionResult })
    }

    tx.onerror = () => {
      reject(tx.error ?? new Error("PWA update state transaction failed"))
    }
  })
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation, operation)
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function transactPwaUpdateState<T>(
  mutator: (state: PwaUpdateStateRecord) => T,
): Promise<T> {
  return enqueueMutation(async () => {
    const db = await openDatabase()
    const { state, result } = await runReadWriteTransaction(db, mutator)
    applyCachedState(state)
    return result
  })
}

export async function hydratePwaUpdateState(): Promise<PwaUpdateStateRecord> {
  if (cachedState) {
    return cachedState
  }

  const db = await openDatabase()
  const persisted = await readPersistedState(db)
  if (persisted) {
    updateCachedStateFromRead(persisted)
    return persisted
  }

  return transactPwaUpdateState((state) => state)
}

export async function refreshPwaUpdateState(): Promise<PwaUpdateStateRecord> {
  const db = await openDatabase()
  const persisted = await readPersistedState(db)
  if (persisted) {
    updateCachedStateFromRead(persisted)
    return persisted
  }

  return hydratePwaUpdateState()
}

export function getCachedPwaUpdateGeneration(): number {
  return cachedState?.generation ?? 0
}

export function getCachedPwaUpdateState(): PwaUpdateStateRecord | null {
  return cachedState
}

export function getCachedActivePwaUpdateId(): string | null {
  return cachedState?.activeUpdateId ?? null
}

export function isValidTombstone(tombstone: PwaUpdateCompletedTombstone): boolean {
  return Date.now() - tombstone.completedAt < PWA_UPDATE_LIFECYCLE_TTL_MS
}

export function isValidCompletionRecord(record: PwaUpdateLifecycleRecord): boolean {
  return Date.now() - record.completedAt < PWA_UPDATE_LIFECYCLE_TTL_MS
}

export function toLifecycleRecord(
  tombstone: PwaUpdateCompletedTombstone,
): PwaUpdateLifecycleRecord {
  return {
    updateId: tombstone.updateId,
    state: "completed",
    completedAt: tombstone.completedAt,
    nonce: tombstone.nonce,
    generation: tombstone.generation,
  }
}

export function readCompletedLifecycleRecord(): PwaUpdateLifecycleRecord | null {
  const tombstone = cachedState?.completed
  if (!tombstone || !isValidTombstone(tombstone)) {
    return null
  }

  return toLifecycleRecord(tombstone)
}

function matchesTombstone(
  tombstone: PwaUpdateCompletedTombstone,
  record: PwaUpdateLifecycleRecord,
): boolean {
  return tombstone.updateId === record.updateId && tombstone.nonce === record.nonce
}

function evaluateConsumeRejection(
  state: PwaUpdateStateRecord,
  record: PwaUpdateLifecycleRecord,
): ConsumePwaUpdateCompletionResult | null {
  if (state.activeUpdateId && state.activeUpdateId !== record.updateId) {
    return "stale"
  }

  if (state.completed) {
    if (!isValidTombstone(state.completed)) {
      state.completed = null
    } else if (!matchesTombstone(state.completed, record)) {
      return "stale"
    }
  }

  return null
}

export async function adoptPwaUpdateId(updateId: string): Promise<boolean> {
  return transactPwaUpdateState((state) => {
    if (state.activeUpdateId && state.activeUpdateId !== updateId) {
      return false
    }

    if (
      !state.activeUpdateId &&
      state.completed &&
      isValidTombstone(state.completed) &&
      state.completed.updateId === updateId
    ) {
      return true
    }

    if (state.activeUpdateId !== updateId) {
      state.generation += 1
      state.activeUpdateId = updateId
      if (state.deferred && state.deferred.updateId !== updateId) {
        state.deferred = null
      }
      if (state.completed && state.completed.updateId !== updateId) {
        state.completed = null
      }
    }

    return true
  })
}

export async function persistCanonicalPwaUpdateId(updateId: string): Promise<string> {
  return transactPwaUpdateState((state) => {
    if (
      !state.activeUpdateId &&
      state.completed &&
      isValidTombstone(state.completed) &&
      state.completed.updateId === updateId
    ) {
      return updateId
    }

    if (state.activeUpdateId !== updateId) {
      state.generation += 1
      state.activeUpdateId = updateId
      if (state.deferred && state.deferred.updateId !== updateId) {
        state.deferred = null
      }
      if (state.completed && state.completed.updateId !== updateId) {
        state.completed = null
      }
    }

    return updateId
  })
}

export async function claimFallbackPwaUpdateId(): Promise<string> {
  return transactPwaUpdateState((state) => {
    if (state.activeUpdateId) {
      return state.activeUpdateId
    }

    const candidateUpdateId = crypto.randomUUID()
    state.generation += 1
    state.activeUpdateId = candidateUpdateId
    return candidateUpdateId
  })
}

export async function completePwaUpdateInStore(
  params: CompletePwaUpdateParams,
): Promise<CompletePwaUpdateOutcome> {
  return transactPwaUpdateState((state) => {
    if (isOriginCompleteStale(state, params)) {
      return { result: "stale" as const }
    }

    const nonce = crypto.randomUUID()
    const completedAt = Date.now()

    state.generation += 1
    state.activeUpdateId = null
    state.deferred = null

    state.completed = {
      updateId: params.updateId,
      generation: state.generation,
      nonce,
      completedAt,
    }

    const record: PwaUpdateLifecycleRecord = {
      updateId: params.updateId,
      state: "completed",
      completedAt,
      nonce,
      generation: state.generation,
    }

    return { result: "accepted" as const, record }
  })
}

function isOriginCompleteStale(
  state: PwaUpdateStateRecord,
  params: CompletePwaUpdateParams,
): boolean {
  return state.activeUpdateId !== params.updateId || state.generation !== params.expectedGeneration
}

export async function consumePwaUpdateCompletionInStore(
  record: PwaUpdateLifecycleRecord,
): Promise<ConsumePwaUpdateCompletionResult> {
  if (!isValidCompletionRecord(record)) {
    return "expired"
  }

  const initialRejection = await transactPwaUpdateState((state) => {
    return evaluateConsumeRejection(state, record)
  })

  if (initialRejection) {
    return initialRejection
  }

  if (pauseDuringMutationForTests) {
    await pauseDuringMutationForTests()

    const rejectionAfterPause = await transactPwaUpdateState((state) => {
      return evaluateConsumeRejection(state, record)
    })

    if (rejectionAfterPause) {
      return rejectionAfterPause
    }
  }

  return transactPwaUpdateState((state) => {
    const rejection = evaluateConsumeRejection(state, record)
    if (rejection) {
      return rejection
    }

    if (state.activeUpdateId === record.updateId) {
      state.activeUpdateId = null
    }

    if (!state.completed || !matchesTombstone(state.completed, record)) {
      state.generation += 1
      state.completed = {
        updateId: record.updateId,
        generation: state.generation,
        nonce: record.nonce,
        completedAt: record.completedAt,
      }
    }

    return "accepted"
  })
}

export async function deferPwaUpdateInStore(updateId: string): Promise<void> {
  await transactPwaUpdateState((state) => {
    state.deferred = {
      updateId,
      deferredAt: Date.now(),
      generation: state.generation,
    }
  })
}

export async function clearDeferredPwaUpdateInStore(): Promise<void> {
  await transactPwaUpdateState((state) => {
    state.deferred = null
  })
}

export function isPwaUpdateDeferredInStore(updateId?: string | null): boolean {
  const deferred = cachedState?.deferred
  if (!deferred) {
    return false
  }

  if (updateId) {
    return deferred.updateId === updateId
  }

  return deferred.updateId.length > 0
}

export async function resetPwaUpdateStateStoreForTests(): Promise<void> {
  await Promise.race([
    mutationQueue.catch(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 100)
    }),
  ])
  mutationQueue = Promise.resolve()
  cachedState = null
  pauseDuringMutationForTests = null

  if (openDatabaseInstance) {
    openDatabaseInstance.close()
    openDatabaseInstance = null
  }
  databasePromise = null

  localStorage.removeItem(LEGACY_ACTIVE_KEY)
  localStorage.removeItem(LEGACY_DEFERRED_KEY)
  localStorage.removeItem(LEGACY_LIFECYCLE_KEY)
  localStorage.removeItem(PWA_UPDATE_SIGNAL_KEY)

  if (typeof indexedDB === "undefined") {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("Failed to reset PWA update state"))
    request.onblocked = () => resolve()
  })
}
