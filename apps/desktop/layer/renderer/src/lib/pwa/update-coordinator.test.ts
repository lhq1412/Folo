import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PWA_BUILD_REVISION_REQUEST, PWA_BUILD_REVISION_RESPONSE } from "./pwa-sw-messages"
import {
  acceptPwaUpdateId,
  beginPwaUpdateCycle,
  broadcastPwaUpdateDeferred,
  clearDeferredPwaUpdateForSession,
  consumePwaUpdateCompletion,
  createPwaUpdateIdFromWaitingWorker,
  deferPwaUpdateForSession,
  getCurrentPwaUpdateId,
  hasProcessedLifecycleCompletion,
  hydratePwaUpdateState,
  isMatchingPwaUpdateId,
  isPwaUpdateDeferredForSession,
  isValidPwaUpdateLifecycleRecord,
  markLifecycleCompletionProcessed,
  markPwaUpdateCompleted,
  parsePwaUpdateLifecycleRecord,
  PWA_ACTIVE_UPDATE_ID_KEY,
  PWA_UPDATE_DEFERRED_KEY,
  PWA_UPDATE_LIFECYCLE_KEY,
  PwaUpdateIdentityUnavailableError,
  readPwaUpdateLifecycleRecord,
  registerServiceWorkerUpdateListener,
  requestWaitingWorkerBuildRevisionWithRetry,
  resetPwaUpdateCoordinatorForTests,
  resolvePwaUpdateId,
  setPauseDuringPwaUpdateStateMutationForTests,
  shouldAcceptPwaUpdateCompletion,
} from "./update-coordinator"
import { persistCanonicalPwaUpdateId } from "./update-state-store"

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>()
  name: string
  listeners = new Set<(event: MessageEvent) => void>()

  constructor(name: string) {
    this.name = name
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set())
    }
    MockBroadcastChannel.channels.get(name)?.add(this)
  }

  postMessage(data: unknown) {
    for (const channel of MockBroadcastChannel.channels.get(this.name) ?? []) {
      for (const listener of channel.listeners) {
        listener({ data } as MessageEvent)
      }
    }
  }

  addEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener)
  }

  close() {
    MockBroadcastChannel.channels.get(this.name)?.delete(this)
  }
}

const FIXED_SW_URL = "https://app.folo.is/sw.js"

const createRegistration = (scriptUrl: string, buildRevision: string) =>
  ({
    waiting: {
      scriptURL: scriptUrl,
      postMessage: (message: { type?: string }, transfer: Transferable[]) => {
        if (message.type !== PWA_BUILD_REVISION_REQUEST) {
          return
        }

        const port = transfer[0] as MessagePort
        port.postMessage({
          type: PWA_BUILD_REVISION_RESPONSE,
          revision: buildRevision,
        })
      },
    },
  }) as ServiceWorkerRegistration

const createSilentRegistration = (scriptUrl: string) =>
  ({
    waiting: {
      scriptURL: scriptUrl,
      postMessage: () => {},
    },
  }) as unknown as ServiceWorkerRegistration

let lockChain = Promise.resolve()

describe("update-coordinator", () => {
  beforeEach(async () => {
    await resetPwaUpdateCoordinatorForTests()
    MockBroadcastChannel.channels.clear()
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)
    lockChain = Promise.resolve()
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, callback: () => unknown) => {
          const run = lockChain.then(() => callback())
          lockChain = run.then(() => undefined).catch(() => undefined)
          return run
        },
      },
    })
  })

  afterEach(async () => {
    vi.useRealTimers()
    setPauseDuringPwaUpdateStateMutationForTests(null)
    await resetPwaUpdateCoordinatorForTests()
    MockBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it("tracks deferred update state per update id", async () => {
    const updateId = await beginPwaUpdateCycle()
    await deferPwaUpdateForSession(updateId)

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
    expect(isPwaUpdateDeferredForSession("other-id")).toBe(false)
  })

  it("clears deferred update state", async () => {
    await deferPwaUpdateForSession("update-1")
    await clearDeferredPwaUpdateForSession()
    expect(isPwaUpdateDeferredForSession("update-1")).toBe(false)
  })

  it("adopts remote update ids in non-origin tabs", async () => {
    await resetPwaUpdateCoordinatorForTests()

    expect(getCurrentPwaUpdateId()).toBeNull()
    expect(await acceptPwaUpdateId("remote-update-id")).toBe(true)
    expect(getCurrentPwaUpdateId()).toBe("remote-update-id")
    expect(isMatchingPwaUpdateId("remote-update-id")).toBe(true)
  })

  it("rejects conflicting update ids from another batch", async () => {
    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-a"), { buildRevision: "rev-a" })

    expect(await acceptPwaUpdateId(createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-b"))).toBe(
      false,
    )
  })

  it("rejects completion from an older update batch when a newer id is active", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v3"), {
      buildRevision: "rev-v3",
    })

    expect(shouldAcceptPwaUpdateCompletion(v3UpdateId)).toBe(true)
    expect(shouldAcceptPwaUpdateCompletion(v2UpdateId)).toBe(false)
  })

  it("accepts completion without persisting active id when storage is empty", () => {
    expect(getCurrentPwaUpdateId()).toBeNull()
    expect(shouldAcceptPwaUpdateCompletion("completed-update-id")).toBe(true)
    expect(getCurrentPwaUpdateId()).toBeNull()
  })

  it("consumes completion atomically and rejects stale batches", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")
    const v2Record = {
      updateId: v2UpdateId,
      state: "completed" as const,
      completedAt: Date.now(),
      nonce: "v2-completion",
    }

    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v3"), {
      buildRevision: "rev-v3",
    })

    expect(await consumePwaUpdateCompletion(v2Record)).toBe("stale")
    expect(getCurrentPwaUpdateId()).toBe(v3UpdateId)
  })

  it("accepts matching completion and retains the shared tombstone", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v2Record = await markPwaUpdateCompleted(v2UpdateId)

    expect(await consumePwaUpdateCompletion(v2Record)).toBe("accepted")
    expect(getCurrentPwaUpdateId()).toBeNull()
    expect(readPwaUpdateLifecycleRecord()?.nonce).toBe(v2Record.nonce)
  })

  it("rejects replay after v3 completion tombstone is established", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await persistCanonicalPwaUpdateId(v3UpdateId)
    const completed = await markPwaUpdateCompleted(v3UpdateId)
    await consumePwaUpdateCompletion(completed)

    expect(
      await consumePwaUpdateCompletion({
        updateId: v2UpdateId,
        state: "completed",
        completedAt: Date.now(),
        nonce: "late-v2",
      }),
    ).toBe("stale")
  })

  it("accepts persisted update ids when module memory is stale", async () => {
    const staleUpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const nextUpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v2"), {
      buildRevision: "rev-v2",
    })
    await persistCanonicalPwaUpdateId(nextUpdateId)

    expect(await acceptPwaUpdateId(nextUpdateId)).toBe(true)
    expect(await acceptPwaUpdateId(staleUpdateId)).toBe(false)
    expect(getCurrentPwaUpdateId()).toBe(nextUpdateId)
  })

  it("reuses persisted update ids when a tab later detects needRefresh", async () => {
    await acceptPwaUpdateId("remote-update-id")

    expect(await beginPwaUpdateCycle()).toBe("remote-update-id")
  })

  it("converges multiple tabs to the same waiting worker update id", async () => {
    const registration = createRegistration(FIXED_SW_URL, "rev-v2")

    const firstTabUpdateId = await resolvePwaUpdateId(registration, { buildRevision: "rev-v2" })
    const secondTabUpdateId = await resolvePwaUpdateId(registration, { buildRevision: "rev-v2" })

    expect(firstTabUpdateId).toBe(createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2"))
    expect(secondTabUpdateId).toBe(firstTabUpdateId)
  })

  it("does not inherit deferred state across worker versions with the same script url", async () => {
    const registration = createRegistration(FIXED_SW_URL, "rev-v2")
    const firstVersionId = await resolvePwaUpdateId(registration, { buildRevision: "rev-v2" })
    await deferPwaUpdateForSession(firstVersionId)

    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v3"), {
      buildRevision: "rev-v3",
    })

    expect(isPwaUpdateDeferredForSession(firstVersionId)).toBe(false)
    expect(getCurrentPwaUpdateId()).toBe(createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3"))
  })

  it("keeps deferred state for newly opened tabs via localStorage", async () => {
    const registration = createRegistration(FIXED_SW_URL, "rev-v2")
    const updateId = await resolvePwaUpdateId(registration, { buildRevision: "rev-v2" })
    await deferPwaUpdateForSession(updateId)

    await resetPwaUpdateCoordinatorForTests()
    localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, updateId)
    localStorage.setItem(
      PWA_UPDATE_DEFERRED_KEY,
      JSON.stringify({ updateId, deferredAt: Date.now() }),
    )
    await hydratePwaUpdateState()

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
  })

  it("shares fallback update ids across tabs via localStorage", async () => {
    const firstTabUpdateId = await beginPwaUpdateCycle()
    await resetPwaUpdateCoordinatorForTests()
    localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, firstTabUpdateId)
    await hydratePwaUpdateState()

    const secondTabUpdateId = await beginPwaUpdateCycle()

    expect(secondTabUpdateId).toBe(firstTabUpdateId)
  })

  it("broadcasts deferred decisions across tabs", async () => {
    const updateId = await beginPwaUpdateCycle()
    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    const listener = vi.fn()
    receiver.addEventListener("message", listener)

    broadcastPwaUpdateDeferred(updateId)
    await new Promise((resolve) => {
      setTimeout(resolve, 50)
    })

    expect(listener).toHaveBeenCalled()
    expect(isMatchingPwaUpdateId(updateId)).toBe(true)
    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)

    receiver.close()
  })

  it("preserves shared state when revision handshake fails locally", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    await persistCanonicalPwaUpdateId(v2UpdateId)
    await deferPwaUpdateForSession(v2UpdateId)

    await expect(resolvePwaUpdateId(createSilentRegistration(FIXED_SW_URL))).rejects.toBeInstanceOf(
      PwaUpdateIdentityUnavailableError,
    )

    expect(getCurrentPwaUpdateId()).toBe(v2UpdateId)
    expect(isPwaUpdateDeferredForSession(v2UpdateId)).toBe(true)
  }, 10_000)

  it("preserves shared state when another tab revision handshake fails", async () => {
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")
    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v3"), {
      buildRevision: "rev-v3",
    })
    await deferPwaUpdateForSession(v3UpdateId)

    await expect(resolvePwaUpdateId(createSilentRegistration(FIXED_SW_URL))).rejects.toBeInstanceOf(
      PwaUpdateIdentityUnavailableError,
    )

    expect(getCurrentPwaUpdateId()).toBe(v3UpdateId)
    expect(isPwaUpdateDeferredForSession(v3UpdateId)).toBe(true)
  }, 10_000)

  it("retries revision handshake before failing", async () => {
    let attempts = 0
    const registration = {
      waiting: {
        scriptURL: FIXED_SW_URL,
        postMessage: (message: { type?: string }, transfer: Transferable[]) => {
          attempts += 1
          if (attempts < 2) {
            return
          }

          const port = transfer[0] as MessagePort
          port.postMessage({
            type: PWA_BUILD_REVISION_RESPONSE,
            revision: "rev-v3",
          })
        },
      },
    } as ServiceWorkerRegistration

    const revision = await requestWaitingWorkerBuildRevisionWithRetry(
      registration.waiting as ServiceWorker,
      {
        attempts: 3,
        baseDelayMs: 1,
      },
    )

    expect(revision).toBe("rev-v3")
    expect(attempts).toBe(2)
  })

  it("resolves canonical update id after a failed revision attempt", async () => {
    let attempts = 0
    const registration = {
      waiting: {
        scriptURL: FIXED_SW_URL,
        postMessage: (message: { type?: string }, transfer: Transferable[]) => {
          attempts += 1
          if (attempts < 2) {
            return
          }

          const port = transfer[0] as MessagePort
          port.postMessage({
            type: PWA_BUILD_REVISION_RESPONSE,
            revision: "rev-v3",
          })
        },
      },
    } as ServiceWorkerRegistration

    const updateId = await resolvePwaUpdateId(registration)

    expect(updateId).toBe(createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3"))
    expect(getCurrentPwaUpdateId()).toBe(updateId)
  })

  it("invalidates stale lifecycle records when a newer update id resolves", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    await markPwaUpdateCompleted(v2UpdateId)

    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v3"), {
      buildRevision: "rev-v3",
    })

    expect(localStorage.getItem(PWA_UPDATE_LIFECYCLE_KEY)).toBeNull()
  })

  it("parses lifecycle records with nonce from storage events", async () => {
    const record = await markPwaUpdateCompleted("update-1")
    const parsed = parsePwaUpdateLifecycleRecord(JSON.stringify(record))

    expect(parsed).toEqual(record)
    expect(parsed?.nonce).toBeTruthy()
  })

  it("rejects expired lifecycle records", () => {
    const record = {
      updateId: "update-1",
      state: "completed" as const,
      completedAt: Date.now() - 5 * 60 * 1000 - 1,
      nonce: "nonce-1",
    }

    expect(isValidPwaUpdateLifecycleRecord(record)).toBe(false)
  })

  it("deduplicates lifecycle completion per tab session", async () => {
    const record = await markPwaUpdateCompleted("update-1")

    expect(hasProcessedLifecycleCompletion(record.nonce)).toBe(false)
    markLifecycleCompletionProcessed(record.nonce)
    expect(hasProcessedLifecycleCompletion(record.nonce)).toBe(true)
  })

  it("notifies when a newly installed worker becomes waiting", () => {
    const onReady = vi.fn()
    const handlers: {
      updateFound: (() => void) | null
      stateChange: (() => void) | null
    } = {
      updateFound: null,
      stateChange: null,
    }

    const installingWorker = {
      state: "installing",
      addEventListener: (type: string, handler: () => void) => {
        if (type === "statechange") {
          handlers.stateChange = handler
        }
      },
      removeEventListener: vi.fn(),
    }

    const registration = {
      waiting: { scriptURL: FIXED_SW_URL },
      installing: installingWorker,
      addEventListener: (type: string, handler: () => void) => {
        if (type === "updatefound") {
          handlers.updateFound = handler
        }
      },
      removeEventListener: vi.fn(),
    } as unknown as ServiceWorkerRegistration

    registerServiceWorkerUpdateListener(registration, onReady)
    handlers.updateFound?.()
    installingWorker.state = "installed"
    handlers.stateChange?.()

    expect(onReady).toHaveBeenCalled()
  })
})
