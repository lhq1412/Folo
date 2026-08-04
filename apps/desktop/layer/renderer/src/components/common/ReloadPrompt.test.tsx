import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UpdaterStatusAtom } from "~/atoms/updater"
import { setUpdaterStatus } from "~/atoms/updater"
import { PWA_BUILD_REVISION_REQUEST, PWA_BUILD_REVISION_RESPONSE } from "~/lib/pwa/pwa-sw-messages"
import {
  createPwaUpdateIdFromWaitingWorker,
  isPwaUpdateDeferredForSession,
  markPwaUpdateCompleted,
  PWA_ACTIVE_UPDATE_ID_KEY,
  PWA_UPDATE_DEFERRED_KEY,
  PWA_UPDATE_LIFECYCLE_KEY,
  resetPwaUpdateCoordinatorForTests,
} from "~/lib/pwa/update-coordinator"
import * as updateCoordinator from "~/lib/pwa/update-coordinator"

import { ReloadPrompt } from "./ReloadPrompt"

const mockUseRegisterSW = vi.fn()
const mockUpdateServiceWorker = vi.fn(async () => {})

const WAITING_SW_URL = "https://example.com/sw.js"
const WAITING_SW_BUILD_REVISION = "mock-build-revision-v2"
const sharedUpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, WAITING_SW_BUILD_REVISION)

const mockRegistration = {
  active: { state: "activated" },
  installing: null,
  waiting: {
    scriptURL: WAITING_SW_URL,
    postMessage: (message: { type?: string }, transfer: Transferable[]) => {
      if (message.type !== PWA_BUILD_REVISION_REQUEST) {
        return
      }

      const port = transfer[0] as MessagePort
      port.postMessage({
        type: PWA_BUILD_REVISION_RESPONSE,
        revision: WAITING_SW_BUILD_REVISION,
      })
    },
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
} as unknown as ServiceWorkerRegistration

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
  let reloadSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(() => {
    resetPwaUpdateCoordinatorForTests()
    localStorage.clear()
    sessionStorage.clear()
    MockBroadcastChannel.channels.clear()
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel)
    vi.clearAllMocks()

    reloadSpy = vi.spyOn(window.location, "reload").mockImplementation(() => {})

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

    reloadSpy?.mockRestore()
    reloadSpy = null
    resetPwaUpdateCoordinatorForTests()
    localStorage.clear()
    MockBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it("accepts update-started messages in a second tab context", async () => {
    const { root } = await renderReloadPrompt()
    roots.push(root)

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "update-started", updateId: sharedUpdateId })

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
      updateId: sharedUpdateId,
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

    expect(getPwaStatusCalls().length).toBeGreaterThanOrEqual(2)
    expect(localStorage.getItem("folo-pwa-active-update-id-v1")).toBe(sharedUpdateId)
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
    receiver.postMessage({ type: "deferred", updateId: sharedUpdateId })

    expect(isPwaUpdateDeferredForSession(sharedUpdateId)).toBe(true)
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
    receiver.postMessage({ type: "update-started", updateId: sharedUpdateId })

    expect(setUpdaterStatus).toHaveBeenCalledWith({
      type: "pwa",
      status: "updating",
    })

    receiver.close()
  })

  it("does not auto reload on update-completed when unsaved work exists", async () => {
    const { root } = await renderReloadPrompt()
    roots.push(root)

    const chatInput = document.createElement("div")
    chatInput.setAttribute("data-testid", "chat-input")
    chatInput.textContent = "draft message"
    document.body.append(chatInput)

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "update-completed", updateId: sharedUpdateId })

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(getPwaStatusCalls().at(-1)).toMatchObject({
      type: "pwa",
      status: "ready",
      reloadOnly: true,
    })
    expect(typeof getPwaStatusCalls().at(-1)?.finishUpdate).toBe("function")

    receiver.close()
    chatInput.remove()
  })

  it("syncs deferred state from localStorage when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)

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

    localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, sharedUpdateId)
    localStorage.setItem(
      PWA_UPDATE_DEFERRED_KEY,
      JSON.stringify({ updateId: sharedUpdateId, deferredAt: Date.now() }),
    )

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_DEFERRED_KEY,
        newValue: JSON.stringify({ updateId: sharedUpdateId, deferredAt: Date.now() }),
        storageArea: localStorage,
      }),
    )

    expect(isPwaUpdateDeferredForSession(sharedUpdateId)).toBe(true)
    expect(getPwaStatusCalls().at(-1)).toMatchObject({
      type: "pwa",
      status: "deferred",
    })
  })

  it("handles remote completion via lifecycle record when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)

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

    const record = markPwaUpdateCompleted(sharedUpdateId)

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_LIFECYCLE_KEY,
        newValue: JSON.stringify(record),
        storageArea: localStorage,
      }),
    )

    expect(reloadSpy).toHaveBeenCalled()
  })

  it("lets each tab process the same lifecycle completion independently", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const record = markPwaUpdateCompleted(sharedUpdateId)
    const lifecyclePayload = JSON.stringify(record)

    const first = await renderReloadPrompt()
    roots.push(first.root)
    await act(async () => {})

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_LIFECYCLE_KEY,
        newValue: lifecyclePayload,
        storageArea: localStorage,
      }),
    )

    expect(reloadSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.root.unmount()
    })
    roots.pop()
    sessionStorage.clear()
    reloadSpy?.mockClear()

    const second = await renderReloadPrompt()
    roots.push(second.root)
    await act(async () => {})

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_LIFECYCLE_KEY,
        newValue: lifecyclePayload,
        storageArea: localStorage,
      }),
    )

    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it("does not reload from stale lifecycle when a newer update becomes active", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)

    const staleUpdateId = createPwaUpdateIdFromWaitingWorker(
      WAITING_SW_URL,
      "mock-build-revision-v2",
    )
    const nextUpdateId = createPwaUpdateIdFromWaitingWorker(
      WAITING_SW_URL,
      "mock-build-revision-v3",
    )

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

    localStorage.setItem(
      PWA_UPDATE_LIFECYCLE_KEY,
      JSON.stringify({
        updateId: staleUpdateId,
        state: "completed",
        completedAt: Date.now(),
        nonce: "stale-lifecycle-nonce",
      }),
    )

    reloadSpy?.mockClear()

    localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, nextUpdateId)
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_ACTIVE_UPDATE_ID_KEY,
        newValue: nextUpdateId,
        storageArea: localStorage,
      }),
    )

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(getPwaStatusCalls().at(-1)).toMatchObject({
      type: "pwa",
      status: "ready",
    })
  })

  it("re-runs reconcile when a new waiting worker arrives during an in-flight reconcile", async () => {
    const { registerServiceWorkerUpdateListener: realRegisterListener } = await vi.importActual<
      typeof updateCoordinator
    >("~/lib/pwa/update-coordinator")

    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v3")

    let releaseFirstResolve: () => void = () => {}
    const firstResolveGate = new Promise<void>((resolve) => {
      releaseFirstResolve = resolve
    })

    const resolveSpy = vi
      .spyOn(updateCoordinator, "resolvePwaUpdateId")
      .mockImplementationOnce(async () => {
        await firstResolveGate
        return v2UpdateId
      })
      .mockImplementationOnce(async () => v3UpdateId)

    let triggerWaitingWorkerReady: () => void = () => {}
    const registerListenerSpy = vi
      .spyOn(updateCoordinator, "registerServiceWorkerUpdateListener")
      .mockImplementation((registration, onReady) => {
        triggerWaitingWorkerReady = onReady
        return realRegisterListener(registration, onReady)
      })

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

    triggerWaitingWorkerReady()
    releaseFirstResolve()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(resolveSpy).toHaveBeenCalledTimes(2)
    expect(getPwaStatusCalls().at(-1)).toMatchObject({
      type: "pwa",
      status: "ready",
    })

    resolveSpy.mockRestore()
    registerListenerSpy.mockRestore()
  })
})
