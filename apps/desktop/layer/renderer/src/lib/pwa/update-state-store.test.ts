import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createPwaUpdateIdFromWaitingWorker,
  PWA_ACTIVE_UPDATE_ID_KEY,
  PWA_UPDATE_DEFERRED_KEY,
  PWA_UPDATE_LIFECYCLE_KEY,
} from "./update-coordinator"
import {
  claimFallbackPwaUpdateId,
  completePwaUpdateInStore,
  consumePwaUpdateCompletionInStore,
  deferPwaUpdateInStore,
  getCachedActivePwaUpdateId,
  getCachedPwaUpdateState,
  hydratePwaUpdateState,
  persistCanonicalPwaUpdateId,
  refreshPwaUpdateState,
  resetPwaUpdateStateStoreForTests,
  setPauseDuringPwaStateMutationForTests,
  transactPwaUpdateState,
} from "./update-state-store"

const FIXED_SW_URL = "https://app.folo.is/sw.js"

function snapshotState() {
  const state = getCachedPwaUpdateState()
  return state ? structuredClone(state) : null
}

async function completeActiveUpdate(updateId: string) {
  const expectedGeneration = getCachedPwaUpdateState()?.generation ?? 0
  const outcome = await completePwaUpdateInStore({ updateId, expectedGeneration })
  if (outcome.result !== "accepted") {
    throw new Error(`Expected accepted completion, received ${outcome.result}`)
  }

  return outcome.record
}

describe("update-state-store", () => {
  beforeEach(async () => {
    await resetPwaUpdateStateStoreForTests()
  })

  afterEach(async () => {
    vi.useRealTimers()
    setPauseDuringPwaStateMutationForTests(null)
    await resetPwaUpdateStateStoreForTests()
    vi.unstubAllGlobals()
  })

  it("persists canonical update ids atomically", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(v2UpdateId)
    await persistCanonicalPwaUpdateId(v3UpdateId)

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBe(v3UpdateId)
  })

  it("accepts origin completion for the matching active batch", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")

    await persistCanonicalPwaUpdateId(v2UpdateId)
    await deferPwaUpdateInStore(v2UpdateId)
    const expectedGeneration = getCachedPwaUpdateState()?.generation ?? 0

    const outcome = await completePwaUpdateInStore({
      updateId: v2UpdateId,
      expectedGeneration,
    })

    expect(outcome.result).toBe("accepted")
    if (outcome.result !== "accepted") {
      return
    }

    const state = getCachedPwaUpdateState()
    expect(state?.activeUpdateId).toBeNull()
    expect(state?.deferred).toBeNull()
    expect(state?.completed).toMatchObject({
      updateId: v2UpdateId,
      nonce: outcome.record.nonce,
      generation: outcome.record.generation,
      completedAt: outcome.record.completedAt,
    })
    expect(state?.generation).toBe(expectedGeneration + 1)
  })

  it("rejects origin completion when no active batch matches", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")

    await hydratePwaUpdateState()
    const before = snapshotState()
    const legacyActive = localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)
    const legacyDeferred = localStorage.getItem(PWA_UPDATE_DEFERRED_KEY)
    const legacyLifecycle = localStorage.getItem(PWA_UPDATE_LIFECYCLE_KEY)

    const outcome = await completePwaUpdateInStore({
      updateId: v2UpdateId,
      expectedGeneration: before?.generation ?? 0,
    })

    expect(outcome.result).toBe("stale")
    expect(snapshotState()).toEqual(before)
    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBe(legacyActive)
    expect(localStorage.getItem(PWA_UPDATE_DEFERRED_KEY)).toBe(legacyDeferred)
    expect(localStorage.getItem(PWA_UPDATE_LIFECYCLE_KEY)).toBe(legacyLifecycle)
  })

  it("rejects stale origin completion with zero writes when a newer active batch exists", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(v2UpdateId)
    const v2Generation = getCachedPwaUpdateState()?.generation ?? 0
    await deferPwaUpdateInStore(v2UpdateId)

    await persistCanonicalPwaUpdateId(v3UpdateId)
    await deferPwaUpdateInStore(v3UpdateId)
    const before = snapshotState()

    const outcome = await completePwaUpdateInStore({
      updateId: v2UpdateId,
      expectedGeneration: v2Generation,
    })

    expect(outcome.result).toBe("stale")
    expect(snapshotState()).toEqual(before)
    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBe(v3UpdateId)
  })

  it("rejects late v2 origin completion when v3 tombstone already exists", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(v2UpdateId)
    const v2Generation = getCachedPwaUpdateState()?.generation ?? 0

    await persistCanonicalPwaUpdateId(v3UpdateId)
    const v3Record = await completeActiveUpdate(v3UpdateId)
    const before = snapshotState()

    const outcome = await completePwaUpdateInStore({
      updateId: v2UpdateId,
      expectedGeneration: v2Generation,
    })

    expect(outcome.result).toBe("stale")
    expect(snapshotState()).toEqual(before)
    expect(getCachedPwaUpdateState()?.completed).toMatchObject({
      updateId: v3UpdateId,
      nonce: v3Record.nonce,
      generation: v3Record.generation,
      completedAt: v3Record.completedAt,
    })
  })

  it("rejects stale completion when a newer active batch exists", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(v3UpdateId)

    const result = await consumePwaUpdateCompletionInStore({
      updateId: v2UpdateId,
      state: "completed",
      completedAt: Date.now(),
      nonce: "stale-v2",
    })

    expect(result).toBe("stale")
    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBe(v3UpdateId)
  })

  it("does not re-persist active id when a matching completion tombstone exists", async () => {
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(v3UpdateId)
    await completeActiveUpdate(v3UpdateId)

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBeNull()

    await persistCanonicalPwaUpdateId(v3UpdateId)

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBeNull()
  })

  it("keeps completion tombstone and rejects replay after active is cleared", async () => {
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")

    await persistCanonicalPwaUpdateId(v3UpdateId)
    const completed = await completeActiveUpdate(v3UpdateId)

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBeNull()

    const replayV3 = await consumePwaUpdateCompletionInStore(completed)
    expect(replayV3).toBe("accepted")

    const staleV2 = await consumePwaUpdateCompletionInStore({
      updateId: v2UpdateId,
      state: "completed",
      completedAt: Date.now(),
      nonce: "late-v2",
    })
    expect(staleV2).toBe("stale")
  })

  it("works without navigator.locks and rejects stale completion", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      locks: undefined,
    })

    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(v3UpdateId)

    expect(
      await consumePwaUpdateCompletionInStore({
        updateId: v2UpdateId,
        state: "completed",
        completedAt: Date.now(),
        nonce: "v2-completion",
      }),
    ).toBe("stale")
    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBe(v3UpdateId)
  })

  it("claims fallback ids only when no active batch exists", async () => {
    const first = await claimFallbackPwaUpdateId()
    const second = await claimFallbackPwaUpdateId()

    expect(second).toBe(first)
  })

  it("ignores legacy localStorage writes after one-time migration", async () => {
    const canonicalId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")
    const staleId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")

    await persistCanonicalPwaUpdateId(canonicalId)
    await refreshPwaUpdateState()

    localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, staleId)
    await refreshPwaUpdateState()

    expect(getCachedActivePwaUpdateId()).toBe(canonicalId)
  })

  it("refresh reads remote IndexedDB state instead of stale cache", async () => {
    const firstId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const secondId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(firstId)
    await hydratePwaUpdateState()

    await transactPwaUpdateState((state) => {
      state.generation += 1
      state.activeUpdateId = secondId
    })

    await refreshPwaUpdateState()

    expect(getCachedActivePwaUpdateId()).toBe(secondId)
  })

  it("serializes concurrent mutations through a single transaction queue", async () => {
    const ids: string[] = []

    await Promise.all([
      transactPwaUpdateState((state) => {
        const id = `batch-${ids.length}`
        state.generation += 1
        state.activeUpdateId = id
        ids.push(id)
        return id
      }),
      transactPwaUpdateState((state) => {
        const id = `batch-${ids.length}`
        state.generation += 1
        state.activeUpdateId = id
        ids.push(id)
        return id
      }),
    ])

    expect(ids).toHaveLength(2)
    expect(getCachedActivePwaUpdateId()).toBe(ids[1])
  })
})
