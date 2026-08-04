import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UpdaterStatusAtom } from "~/atoms/updater"
import { setUpdaterStatus } from "~/atoms/updater"
import { PWA_BUILD_REVISION_REQUEST, PWA_BUILD_REVISION_RESPONSE } from "~/lib/pwa/pwa-sw-messages"
import {
  createPwaUpdateIdFromWaitingWorker,
  deferPwaUpdateForSession,
  hasProcessedLifecycleCompletion,
  isPwaUpdateDeferredForSession,
  markPwaUpdateCompleted,
  persistCanonicalPwaUpdateId,
  PWA_ACTIVE_UPDATE_ID_KEY,
  PWA_UPDATE_LIFECYCLE_KEY,
  PWA_UPDATE_SIGNAL_KEY,
  resetPwaUpdateCoordinatorForTests,
} from "~/lib/pwa/update-coordinator"
import * as updateCoordinator from "~/lib/pwa/update-coordinator"

import { ReloadPrompt, resetPwaUpdateSessionForTests } from "./ReloadPrompt"

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

const flushAsyncUpdates = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }
}

const dispatchPwaUpdateSignal = () => {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: PWA_UPDATE_SIGNAL_KEY,
      newValue: crypto.randomUUID(),
      storageArea: localStorage,
    }),
  )
}

describe("ReloadPrompt cross-tab updates", () => {
  const roots: Root[] = []
  let reloadSpy: ReturnType<typeof vi.spyOn> | null = null

  beforeEach(async () => {
    resetPwaUpdateSessionForTests()
    await resetPwaUpdateCoordinatorForTests()
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
    resetPwaUpdateSessionForTests()
    await resetPwaUpdateCoordinatorForTests()

    for (const root of roots.splice(0)) {
      await act(async () => {
        root.unmount()
      })
    }

    reloadSpy?.mockRestore()
    reloadSpy = null
    localStorage.clear()
    MockBroadcastChannel.channels.clear()
    vi.unstubAllGlobals()
  })

  it("accepts update-started messages in a second tab context", async () => {
    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const first = await renderReloadPrompt()
    roots.push(first.root)
    await flushAsyncUpdates()

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [false],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const second = await renderReloadPrompt()
    roots.push(second.root)
    await flushAsyncUpdates()

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "update-started", updateId: sharedUpdateId })
    await flushAsyncUpdates()

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
    await flushAsyncUpdates()

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

    await flushAsyncUpdates()

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
    await flushAsyncUpdates()

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "deferred", updateId: sharedUpdateId })
    await flushAsyncUpdates()

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
    await flushAsyncUpdates()

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({ type: "update-started", updateId: sharedUpdateId })
    await flushAsyncUpdates()

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
    receiver.postMessage({
      type: "update-completed",
      updateId: sharedUpdateId,
      nonce: "completed-nonce",
      completedAt: Date.now(),
    })
    await flushAsyncUpdates()

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
    await flushAsyncUpdates()

    await deferPwaUpdateForSession(sharedUpdateId)
    dispatchPwaUpdateSignal()
    await flushAsyncUpdates()

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
    await flushAsyncUpdates()

    await markPwaUpdateCompleted(sharedUpdateId)

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_SIGNAL_KEY,
        newValue: crypto.randomUUID(),
        storageArea: localStorage,
      }),
    )
    await flushAsyncUpdates()

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

    await markPwaUpdateCompleted(sharedUpdateId)

    const first = await renderReloadPrompt()
    roots.push(first.root)
    await flushAsyncUpdates()

    dispatchPwaUpdateSignal()
    await flushAsyncUpdates()

    expect(reloadSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.root.unmount()
    })
    roots.pop()
    sessionStorage.clear()
    reloadSpy?.mockClear()

    const second = await renderReloadPrompt()
    roots.push(second.root)
    await flushAsyncUpdates()

    dispatchPwaUpdateSignal()
    await flushAsyncUpdates()

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
    await flushAsyncUpdates()

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
    await flushAsyncUpdates()

    try {
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
    } finally {
      releaseFirstResolve()
      resolveSpy.mockRestore()
      registerListenerSpy.mockRestore()
    }
  })

  it("ignores a stale lifecycle event when the tab already coordinates to a newer update", async () => {
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
    await flushAsyncUpdates()

    localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, nextUpdateId)
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_ACTIVE_UPDATE_ID_KEY,
        newValue: nextUpdateId,
        storageArea: localStorage,
      }),
    )

    reloadSpy?.mockClear()

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_LIFECYCLE_KEY,
        newValue: JSON.stringify({
          updateId: staleUpdateId,
          state: "completed",
          completedAt: Date.now(),
          nonce: "late-v2-lifecycle",
        }),
        storageArea: localStorage,
      }),
    )

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(getPwaStatusCalls().at(-1)).toMatchObject({
      type: "pwa",
      status: "ready",
    })
  })

  it("deduplicates completion delivered via lifecycle storage and BroadcastChannel", async () => {
    const record = {
      updateId: sharedUpdateId,
      state: "completed" as const,
      completedAt: Date.now(),
      nonce: "shared-completion-nonce",
    }

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const { root } = await renderReloadPrompt()
    roots.push(root)
    await flushAsyncUpdates()

    localStorage.setItem(PWA_ACTIVE_UPDATE_ID_KEY, sharedUpdateId)
    reloadSpy?.mockClear()

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_LIFECYCLE_KEY,
        newValue: JSON.stringify(record),
        storageArea: localStorage,
      }),
    )
    await flushAsyncUpdates()

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({
      type: "update-completed",
      updateId: record.updateId,
      nonce: record.nonce,
      completedAt: record.completedAt,
    })
    await flushAsyncUpdates()

    expect(reloadSpy).toHaveBeenCalledTimes(1)
    receiver.close()
  })

  it("does not activate a stale update batch while a newer waiting worker is reconciling", async () => {
    const { registerServiceWorkerUpdateListener: realRegisterListener } = await vi.importActual<
      typeof updateCoordinator
    >("~/lib/pwa/update-coordinator")

    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v3")

    let releaseSecondResolve: () => void = () => {}
    const secondResolveGate = new Promise<void>((resolve) => {
      releaseSecondResolve = resolve
    })

    let resolveCalls = 0
    const resolveSpy = vi
      .spyOn(updateCoordinator, "resolvePwaUpdateId")
      .mockImplementation(async () => {
        resolveCalls += 1
        if (resolveCalls === 1) {
          return v2UpdateId
        }
        if (resolveCalls === 2) {
          await secondResolveGate
          return v3UpdateId
        }
        return v3UpdateId
      })

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
    await flushAsyncUpdates()

    const staleFinishUpdate = getPwaStatusCalls().at(-1)?.finishUpdate
    expect(typeof staleFinishUpdate).toBe("function")

    try {
      triggerWaitingWorkerReady()
      await act(async () => {
        await staleFinishUpdate?.()
      })

      expect(mockUpdateServiceWorker).not.toHaveBeenCalled()
    } finally {
      releaseSecondResolve()
      resolveSpy.mockRestore()
      registerListenerSpy.mockRestore()
    }
  })

  it("does not re-persist active update id when handling remote completion", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const chatInput = document.createElement("div")
    chatInput.setAttribute("data-testid", "chat-input")
    chatInput.textContent = "draft message"
    document.body.append(chatInput)

    const { root } = await renderReloadPrompt()
    roots.push(root)
    await flushAsyncUpdates()

    await markPwaUpdateCompleted(sharedUpdateId)

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_SIGNAL_KEY,
        newValue: crypto.randomUUID(),
        storageArea: localStorage,
      }),
    )
    await flushAsyncUpdates()

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBeNull()
    expect(getPwaStatusCalls().at(-1)).toMatchObject({
      type: "pwa",
      status: "ready",
      reloadOnly: true,
    })

    chatInput.remove()
  })

  it("accepts update-started for a newer batch after completion cleared active state", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v3")

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const chatInput = document.createElement("div")
    chatInput.setAttribute("data-testid", "chat-input")
    chatInput.textContent = "draft message"
    document.body.append(chatInput)

    const { root } = await renderReloadPrompt()
    roots.push(root)
    await flushAsyncUpdates()

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({
      type: "update-completed",
      updateId: v2UpdateId,
      nonce: "completion-nonce",
      completedAt: Date.now(),
    })
    await flushAsyncUpdates()

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBeNull()

    vi.mocked(setUpdaterStatus).mockClear()
    receiver.postMessage({ type: "update-started", updateId: v3UpdateId })
    await flushAsyncUpdates()

    expect(setUpdaterStatus).toHaveBeenCalledWith({
      type: "pwa",
      status: "updating",
    })

    receiver.close()
    chatInput.remove()
  })

  it("ignores stale v2 update-completed when v3 is already the active batch", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v3")

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const { root } = await renderReloadPrompt()
    roots.push(root)
    await flushAsyncUpdates()

    await persistCanonicalPwaUpdateId(v3UpdateId)
    dispatchPwaUpdateSignal()
    await flushAsyncUpdates()

    reloadSpy?.mockClear()
    vi.mocked(setUpdaterStatus).mockClear()

    const receiver = new MockBroadcastChannel("folo-pwa-update-v1")
    receiver.postMessage({
      type: "update-completed",
      updateId: v2UpdateId,
      nonce: "stale-v2-completion",
      completedAt: Date.now(),
    })
    await flushAsyncUpdates()

    expect(localStorage.getItem(PWA_ACTIVE_UPDATE_ID_KEY)).toBe(v3UpdateId)
    expect(hasProcessedLifecycleCompletion("stale-v2-completion")).toBe(false)
    expect(reloadSpy).not.toHaveBeenCalled()
    expect(setUpdaterStatus).not.toHaveBeenCalled()

    receiver.close()
  })

  it("does not override reloadOnly UI when a stale completion arrives after tombstone is established", async () => {
    const staleUpdateId = createPwaUpdateIdFromWaitingWorker(
      WAITING_SW_URL,
      "mock-build-revision-v1",
    )

    vi.stubGlobal("BroadcastChannel", undefined)

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const chatInput = document.createElement("div")
    chatInput.setAttribute("data-testid", "chat-input")
    chatInput.textContent = "draft message"
    document.body.append(chatInput)

    const { root } = await renderReloadPrompt()
    roots.push(root)
    await flushAsyncUpdates()

    await markPwaUpdateCompleted(sharedUpdateId)

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_SIGNAL_KEY,
        newValue: crypto.randomUUID(),
        storageArea: localStorage,
      }),
    )
    await flushAsyncUpdates()

    expect(
      getPwaStatusCalls().some((status) => status.status === "ready" && status.reloadOnly === true),
    ).toBe(true)

    reloadSpy?.mockClear()
    vi.mocked(setUpdaterStatus).mockClear()

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PWA_UPDATE_LIFECYCLE_KEY,
        newValue: JSON.stringify({
          updateId: staleUpdateId,
          state: "completed",
          completedAt: Date.now(),
          nonce: "late-v2-completion",
        }),
        storageArea: localStorage,
      }),
    )
    await flushAsyncUpdates()

    expect(reloadSpy).not.toHaveBeenCalled()
    expect(setUpdaterStatus).not.toHaveBeenCalled()
    expect(hasProcessedLifecycleCompletion("late-v2-completion")).toBe(false)

    chatInput.remove()
  })

  it("re-validates canonical update id after unsaved-work confirmation", async () => {
    const v2UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v2")
    const v3UpdateId = createPwaUpdateIdFromWaitingWorker(WAITING_SW_URL, "mock-build-revision-v3")

    let resolveCalls = 0
    const resolveSpy = vi
      .spyOn(updateCoordinator, "resolvePwaUpdateId")
      .mockImplementation(async () => {
        resolveCalls += 1
        return resolveCalls === 1 ? v2UpdateId : v3UpdateId
      })

    const confirmMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal("confirm", confirmMock)

    mockUseRegisterSW.mockImplementation((options) => {
      options?.onRegisteredSW?.(WAITING_SW_URL, mockRegistration)
      return {
        needRefresh: [true],
        updateServiceWorker: mockUpdateServiceWorker,
      }
    })

    const chatInput = document.createElement("div")
    chatInput.setAttribute("data-testid", "chat-input")
    chatInput.textContent = "draft message"
    document.body.append(chatInput)

    const { root } = await renderReloadPrompt()
    roots.push(root)
    await flushAsyncUpdates()

    const finishUpdate = getPwaStatusCalls().at(-1)?.finishUpdate

    try {
      await act(async () => {
        await finishUpdate?.()
      })

      expect(mockUpdateServiceWorker).not.toHaveBeenCalled()
    } finally {
      resolveSpy.mockRestore()
      vi.unstubAllGlobals()
      chatInput.remove()
    }
  })
})
