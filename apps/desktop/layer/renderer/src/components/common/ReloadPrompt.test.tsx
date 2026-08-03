import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UpdaterStatusAtom } from "~/atoms/updater"
import { setUpdaterStatus } from "~/atoms/updater"
import {
  isPwaUpdateDeferredForSession,
  resetPwaUpdateCoordinatorForTests,
} from "~/lib/pwa/update-coordinator"

import { ReloadPrompt } from "./ReloadPrompt"

const mockUseRegisterSW = vi.fn()
const mockUpdateServiceWorker = vi.fn(async () => {})

const WAITING_SW_URL = "https://example.com/sw-v2.js"
const SHARED_UPDATE_ID = `sw:${WAITING_SW_URL}`

const mockRegistration = {
  waiting: { scriptURL: WAITING_SW_URL },
} as ServiceWorkerRegistration

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

const renderReloadPrompt = async (options?: { needRefresh?: boolean }) => {
  const container = document.createElement("div")
  document.body.append(container)

  const root = createRoot(container)
  await act(async () => {
    root.render(<ReloadPrompt />)
  })

  if (options?.needRefresh) {
    await act(async () => {
      root.render(<ReloadPrompt />)
    })
  }

  return { container, root }
}

const getPwaStatusCalls = () => {
  const statuses: Extract<UpdaterStatusAtom, { type: "pwa" }>[] = []

  for (const call of vi.mocked(setUpdaterStatus).mock.calls) {
    const status = call[0]
    if (status && typeof status === "object" && status.type === "pwa") {
      statuses.push(status)
    }
  }

  return statuses
}

describe("ReloadPrompt cross-tab updates", () => {
  const roots: Root[] = []

  beforeEach(() => {
    resetPwaUpdateCoordinatorForTests()
    localStorage.clear()
    MockBroadcastChannel.channels.clear()
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)
    vi.clearAllMocks()

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [false],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })
  })

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await act(async () => {
        root.unmount()
      })
    }

    resetPwaUpdateCoordinatorForTests()
    localStorage.clear()
    MockBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it("accepts update-started messages in a second tab context", async () => {
    const { root } = await renderReloadPrompt()
    roots.push(root)

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "update-started", updateId: SHARED_UPDATE_ID })

    expect(setUpdaterStatus).toHaveBeenCalledWith({
      type: "pwa",
      status: "updating",
    })

    receiver.close()
  })

  it("binds retry actions after update-failed in a second tab context", async () => {
    const { root } = await renderReloadPrompt()
    roots.push(root)

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({
      type: "update-failed",
      updateId: SHARED_UPDATE_ID,
      error: "network",
    })

    const lastCall = getPwaStatusCalls().at(-1)
    expect(lastCall).toMatchObject({
      type: "pwa",
      status: "failed",
      error: "network",
    })
    expect(typeof lastCall?.finishUpdate).toBe("function")

    receiver.close()
  })

  it("uses the same update id when two instances detect needRefresh", async () => {
    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const first = await renderReloadPrompt()
    const second = await renderReloadPrompt()
    roots.push(first.root, second.root)

    await act(async () => {})

    const updateIds = getPwaStatusCalls()
      .map((status) => status.status)
      .filter((status) => status === "ready" || status === "deferred")

    expect(getPwaStatusCalls().length).toBeGreaterThanOrEqual(2)
    expect(localStorage.getItem("folo-pwa-active-update-id-v1")).toBe(SHARED_UPDATE_ID)
    expect(updateIds.length).toBeGreaterThanOrEqual(2)
  })

  it("persists deferred state when another tab clicks later", async () => {
    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const { root } = await renderReloadPrompt()
    roots.push(root)
    await act(async () => {})

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "deferred", updateId: SHARED_UPDATE_ID })

    expect(isPwaUpdateDeferredForSession(SHARED_UPDATE_ID)).toBe(true)
    expect(getPwaStatusCalls().at(-1)).toMatchObject({
      type: "pwa",
      status: "deferred",
    })

    receiver.close()
  })

  it("accepts update-started from the tab that initiated the shared update batch", async () => {
    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const first = await renderReloadPrompt()
    const second = await renderReloadPrompt()
    roots.push(first.root, second.root)
    await act(async () => {})

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "update-started", updateId: SHARED_UPDATE_ID })

    expect(setUpdaterStatus).toHaveBeenCalledWith({
      type: "pwa",
      status: "updating",
    })

    receiver.close()
  })
})
