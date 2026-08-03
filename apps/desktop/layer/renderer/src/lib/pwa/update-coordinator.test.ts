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
    beginPwaUpdateCycle()

    expect(acceptPwaUpdateId("different-update-id")).toBe(false)
  })

  it("reuses persisted update ids when a tab later detects needRefresh", () => {
    acceptPwaUpdateId("remote-update-id")

    expect(beginPwaUpdateCycle()).toBe("remote-update-id")
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
