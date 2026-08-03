import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setUpdaterStatus } from "~/atoms/updater"

import { ReloadPrompt } from "./ReloadPrompt"

const mockUseRegisterSW = vi.fn()
const mockUpdateServiceWorker = vi.fn(async () => {})

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (options: {
    onRegisterError?: (error: Error) => void
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  }) => mockUseRegisterSW(options),
}))

vi.mock("~/atoms/updater", () => ({
  getUpdaterStatus: vi.fn(),
  setUpdaterStatus: vi.fn(),
}))

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

const renderReloadPrompt = async () => {
  const container = document.createElement("div")
  document.body.append(container)

  const root = createRoot(container)
  await act(async () => {
    root.render(<ReloadPrompt />)
  })

  return { container, root }
}

describe("ReloadPrompt cross-tab updates", () => {
  let root: Root | null = null

  beforeEach(() => {
    sessionStorage.clear()
    MockBroadcastChannel.channels.clear()
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)
    vi.clearAllMocks()

    mockUseRegisterSW.mockImplementation(() => ({
      needRefresh: [false],
      updateServiceWorker: mockUpdateServiceWorker,
    }))
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
      root = null
    }

    sessionStorage.clear()
    MockBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it("accepts update-started messages in a second tab context", async () => {
    ;({ root } = await renderReloadPrompt())

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "update-started", updateId: "shared-update-id" })

    expect(setUpdaterStatus).toHaveBeenCalledWith({
      type: "pwa",
      status: "updating",
    })

    receiver.close()
  })

  it("binds retry actions after update-failed in a second tab context", async () => {
    ;({ root } = await renderReloadPrompt())

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({
      type: "update-failed",
      updateId: "shared-update-id",
      error: "network",
    })

    const lastCall = vi.mocked(setUpdaterStatus).mock.calls.at(-1)?.[0]
    expect(lastCall).toMatchObject({
      type: "pwa",
      status: "failed",
      error: "network",
    })

    if (!lastCall || typeof lastCall === "function" || lastCall.type !== "pwa") {
      throw new Error("Expected PWA updater status")
    }

    expect(typeof lastCall.finishUpdate).toBe("function")

    receiver.close()
  })
})
