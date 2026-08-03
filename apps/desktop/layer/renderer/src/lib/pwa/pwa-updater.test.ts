import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setUpdaterStatus } from "~/atoms/updater"

import { createPwaUpdaterStatus } from "./pwa-updater"
import {
  beginPwaUpdateCycle,
  isPwaUpdateDeferredForSession,
  resetPwaUpdateCoordinatorForTests,
} from "./update-coordinator"

vi.mock("~/atoms/updater", () => ({
  setUpdaterStatus: vi.fn(),
}))

describe("pwa-updater", () => {
  beforeEach(() => {
    resetPwaUpdateCoordinatorForTests()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetPwaUpdateCoordinatorForTests()
    vi.unstubAllGlobals()
  })

  it("updates local updater state immediately when deferring", () => {
    const updateId = beginPwaUpdateCycle()
    const finishUpdate = vi.fn(async () => {})
    const status = createPwaUpdaterStatus("ready", finishUpdate, { updateId })

    expect(status.type).toBe("pwa")
    expect(status.status).toBe("ready")

    if (status.type === "pwa") {
      status.deferUpdate?.()
    }

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
    expect(setUpdaterStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pwa",
        status: "deferred",
      }),
    )
  })

  it("defers locally when BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined)

    const updateId = beginPwaUpdateCycle()
    const finishUpdate = vi.fn(async () => {})
    const status = createPwaUpdaterStatus("ready", finishUpdate, { updateId })

    if (status.type === "pwa") {
      status.deferUpdate?.()
    }

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
    expect(setUpdaterStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pwa",
        status: "deferred",
      }),
    )
  })
})
