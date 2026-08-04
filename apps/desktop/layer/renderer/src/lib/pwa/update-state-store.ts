import { promisifyRequest } from "idb-keyval"

const DB_NAME = "folo-pwa-update-state-v1"
const STORE_NAME = "coordinator"
const STATE_KEY = "state"

export const PWA_UPDATE_SIGNAL_KEY = "folo-pwa-update-signal-v2"

export const PWA_UPDATE_LIFECYCLE_TTL_MS = 5 * 60 * 1000

export type PwaUpdateLifecycleRecord = {
  updateId: string
  state: "completed"
  completedAt: number
  nonce: string
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
  schemaVersion: 1
  generation: number
  activeUpdateId: string | null
  deferred: PwaUpdateDeferredState | null
  completed: PwaUpdateCompletedTombstone | null
}

export type ConsumePwaUpdateCompletionResult = "accepted" | "stale" | "expired"

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
    schemaVersion: 1,
    generation: 0,
    activeUpdateId: null,
    deferred: null,
    completed: null,
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

function applyCachedState(state: PwaUpdateStateRecord): void {
  cachedState = state
  syncLegacyStorageMirror(state)
  emitStateSignal()
}

async function readStateFromDatabase(db: IDBDatabase): Promise<PwaUpdateStateRecord> {
  const tx = db.transaction(STORE_NAME, "readonly")
  const store = tx.objectStore(STORE_NAME)
  const existing = (await promisifyRequest(store.get(STATE_KEY))) as
    PwaUpdateStateRecord | undefined

  if (existing?.schemaVersion === 1) {
    return existing
  }

  return migrateFromLegacyStorage()
}

async function writeStateToDatabase(db: IDBDatabase, state: PwaUpdateStateRecord): Promise<void> {
  const tx = db.transaction(STORE_NAME, "readwrite")
  const store = tx.objectStore(STORE_NAME)
  await promisifyRequest(store.put(state, STATE_KEY))
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation, operation)
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export async function mutatePwaUpdateState<T>(
  mutator: (state: PwaUpdateStateRecord) => T | Promise<T>,
): Promise<T> {
  return enqueueMutation(async () => {
    const db = await openDatabase()
    const state = await readStateFromDatabase(db)
    const result = await mutator(state)
    await writeStateToDatabase(db, state)
    applyCachedState(state)
    return result
  })
}

export async function hydratePwaUpdateState(): Promise<PwaUpdateStateRecord> {
  if (cachedState) {
    return cachedState
  }

  const db = await openDatabase()
  const state = await readStateFromDatabase(db)
  applyCachedState(state)
  return state
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

export async function mergeLegacyMirrorIntoPwaUpdateState(): Promise<PwaUpdateStateRecord> {
  return mutatePwaUpdateState((state) => {
    const activeUpdateId = localStorage.getItem(LEGACY_ACTIVE_KEY)
    if (activeUpdateId && activeUpdateId !== state.activeUpdateId) {
      state.generation += 1
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
  })
}

export async function adoptPwaUpdateId(updateId: string): Promise<boolean> {
  return mutatePwaUpdateState((state) => {
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
  return mutatePwaUpdateState((state) => {
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
  return mutatePwaUpdateState((state) => {
    if (state.activeUpdateId) {
      return state.activeUpdateId
    }

    const candidateUpdateId = crypto.randomUUID()
    state.generation += 1
    state.activeUpdateId = candidateUpdateId
    return candidateUpdateId
  })
}

export async function writePwaUpdateCompleted(updateId: string): Promise<PwaUpdateLifecycleRecord> {
  return mutatePwaUpdateState((state) => {
    const record: PwaUpdateLifecycleRecord = {
      updateId,
      state: "completed",
      completedAt: Date.now(),
      nonce: crypto.randomUUID(),
    }

    state.generation += 1
    if (state.activeUpdateId === updateId) {
      state.activeUpdateId = null
    }

    state.completed = {
      updateId: record.updateId,
      generation: state.generation,
      nonce: record.nonce,
      completedAt: record.completedAt,
    }

    return record
  })
}

export async function consumePwaUpdateCompletionInStore(
  record: PwaUpdateLifecycleRecord,
): Promise<ConsumePwaUpdateCompletionResult> {
  if (!isValidCompletionRecord(record)) {
    return "expired"
  }

  return enqueueMutation(async () => {
    const db = await openDatabase()
    let state = await readStateFromDatabase(db)

    const evaluate = (): ConsumePwaUpdateCompletionResult | null => {
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

    let rejection = evaluate()
    if (rejection) {
      return rejection
    }

    if (pauseDuringMutationForTests) {
      await pauseDuringMutationForTests()
      state = await readStateFromDatabase(db)
      rejection = evaluate()
      if (rejection) {
        return rejection
      }
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

    await writeStateToDatabase(db, state)
    applyCachedState(state)
    return "accepted"
  })
}

export async function deferPwaUpdateInStore(updateId: string): Promise<void> {
  await mutatePwaUpdateState((state) => {
    state.deferred = {
      updateId,
      deferredAt: Date.now(),
      generation: state.generation,
    }
  })
}

export async function clearDeferredPwaUpdateInStore(): Promise<void> {
  await mutatePwaUpdateState((state) => {
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
