import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PWA_BUILD_REVISION_REQUEST, PWA_BUILD_REVISION_RESPONSE } from "./pwa-sw-messages"
import {
  acceptPwaUpdateId,
  beginPwaUpdateCycle,
  broadcastPwaUpdateDeferred,
  clearDeferredPwaUpdateForSession,
  createPwaUpdateIdFromWaitingWorker,
  deferPwaUpdateForSession,
  getCurrentPwaUpdateId,
  isMatchingPwaUpdateId,
  isPwaUpdateDeferredForSession,
  resetPwaUpdateCoordinatorForTests,
  resolvePwaUpdateId,
} from "./update-coordinator"

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

describe("update-coordinator", () => {
  beforeEach(() => {
    resetPwaUpdateCoordinatorForTests()
    MockBroadcastChannel.channels.clear()
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)
  })

  afterEach(() => {
    resetPwaUpdateCoordinatorForTests()
    MockBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it("tracks deferred update state per update id", () => {
    const updateId = beginPwaUpdateCycle()
    deferPwaUpdateForSession(updateId)

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
    expect(isPwaUpdateDeferredForSession("other-id")).toBe(false)
  })

  it("clears deferred update state", () => {
    deferPwaUpdateForSession("update-1")
    clearDeferredPwaUpdateForSession()
    expect(isPwaUpdateDeferredForSession("update-1")).toBe(false)
  })

  it("adopts remote update ids in non-origin tabs", () => {
    resetPwaUpdateCoordinatorForTests()

    expect(getCurrentPwaUpdateId()).toBeNull()
    expect(acceptPwaUpdateId("remote-update-id")).toBe(true)
    expect(getCurrentPwaUpdateId()).toBe("remote-update-id")
    expect(isMatchingPwaUpdateId("remote-update-id")).toBe(true)
  })

  it("rejects conflicting update ids from another batch", async () => {
    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-a"), { buildRevision: "rev-a" })

    expect(acceptPwaUpdateId(createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-b"))).toBe(false)
  })

  it("accepts persisted update ids when module memory is stale", async () => {
    const staleUpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v2")
    const nextUpdateId = createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3")

    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v2"), {
      buildRevision: "rev-v2",
    })
    localStorage.setItem("folo-pwa-active-update-id-v1", nextUpdateId)

    expect(acceptPwaUpdateId(nextUpdateId)).toBe(true)
    expect(acceptPwaUpdateId(staleUpdateId)).toBe(false)
    expect(getCurrentPwaUpdateId()).toBe(nextUpdateId)
  })

  it("reuses persisted update ids when a tab later detects needRefresh", () => {
    acceptPwaUpdateId("remote-update-id")

    expect(beginPwaUpdateCycle()).toBe("remote-update-id")
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
    deferPwaUpdateForSession(firstVersionId)

    await resolvePwaUpdateId(createRegistration(FIXED_SW_URL, "rev-v3"), {
      buildRevision: "rev-v3",
    })

    expect(isPwaUpdateDeferredForSession(firstVersionId)).toBe(false)
    expect(getCurrentPwaUpdateId()).toBe(createPwaUpdateIdFromWaitingWorker(FIXED_SW_URL, "rev-v3"))
  })

  it("keeps deferred state for newly opened tabs via localStorage", async () => {
    const registration = createRegistration(FIXED_SW_URL, "rev-v2")
    const updateId = await resolvePwaUpdateId(registration, { buildRevision: "rev-v2" })
    deferPwaUpdateForSession(updateId)

    resetPwaUpdateCoordinatorForTests()
    localStorage.setItem("folo-pwa-active-update-id-v1", updateId)
    localStorage.setItem(
      "folo-pwa-update-deferred-v1",
      JSON.stringify({ updateId, deferredAt: Date.now() }),
    )

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
  })

  it("shares fallback update ids across tabs via localStorage", () => {
    const firstTabUpdateId = beginPwaUpdateCycle()
    resetPwaUpdateCoordinatorForTests()
    localStorage.setItem("folo-pwa-active-update-id-v1", firstTabUpdateId)

    const secondTabUpdateId = beginPwaUpdateCycle()

    expect(secondTabUpdateId).toBe(firstTabUpdateId)
  })

  it("broadcasts deferred decisions across tabs", () => {
    const updateId = beginPwaUpdateCycle()
    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    const listener = vi.fn()
    receiver.addEventListener("message", listener)

    broadcastPwaUpdateDeferred(updateId)

    expect(listener).toHaveBeenCalled()
    expect(isMatchingPwaUpdateId(updateId)).toBe(true)
    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)

    receiver.close()
  })
})
