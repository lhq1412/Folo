import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  acceptPwaUpdateId,
  beginPwaUpdateCycle,
  broadcastPwaUpdateDeferred,
  clearDeferredPwaUpdateForSession,
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

const createRegistration = (scriptUrl: string) =>
  ({
    waiting: { scriptURL: scriptUrl },
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

  it("rejects conflicting update ids from another batch", () => {
    resolvePwaUpdateId(createRegistration("https://example.com/sw-a.js"))

    expect(acceptPwaUpdateId("sw:https://example.com/sw-b.js")).toBe(false)
  })

  it("reuses persisted update ids when a tab later detects needRefresh", () => {
    acceptPwaUpdateId("remote-update-id")

    expect(beginPwaUpdateCycle()).toBe("remote-update-id")
  })

  it("converges multiple tabs to the same waiting worker update id", () => {
    const registration = createRegistration("https://example.com/sw-v2.js")

    const firstTabUpdateId = resolvePwaUpdateId(registration)
    const secondTabUpdateId = resolvePwaUpdateId(registration)

    expect(firstTabUpdateId).toBe("sw:https://example.com/sw-v2.js")
    expect(secondTabUpdateId).toBe(firstTabUpdateId)
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
