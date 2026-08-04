import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createPwaUpdateIdFromWaitingWorker, PWA_ACTIVE_UPDATE_ID_KEY } from "./update-coordinator"
import {
  claimFallbackPwaUpdateId,
  consumePwaUpdateCompletionInStore,
  getCachedActivePwaUpdateId,
  hydratePwaUpdateState,
  persistCanonicalPwaUpdateId,
  refreshPwaUpdateState,
  resetPwaUpdateStateStoreForTests,
  setPauseDuringPwaStateMutationForTests,
  transactPwaUpdateState,
  writePwaUpdateCompleted,
} from "./update-state-store"

const FIXED_SW_URL = "https://app.folo.is/sw.js"

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
    await writePwaUpdateCompleted(v3UpdateId)

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBeNull()

    await persistCanonicalPwaUpdateId(v3UpdateId)

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBeNull()
  })

  it("keeps completion tombstone and rejects replay after active is cleared", async () => {
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")

    await persistCanonicalPwaUpdateId(v3UpdateId)
    const completed = await writePwaUpdateCompleted(v3UpdateId)

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
