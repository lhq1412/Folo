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
  beforeEach(async () => {
    await resetPwaUpdateCoordinatorForTests()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await resetPwaUpdateCoordinatorForTests()
    vi.unstubAllGlobals()
  })

  it("updates local updater state immediately when deferring", async () => {
    const updateId = await beginPwaUpdateCycle()
    const finishUpdate = vi.fn(async () => {})
    const status = createPwaUpdaterStatus("ready", finishUpdate, { updateId })

    expect(status.type).toBe("pwa")
    expect(status.status).toBe("ready")

    if (status.type === "pwa") {
      status.deferUpdate?.()
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
    expect(setUpdaterStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pwa",
        status: "deferred",
      }),
    )
  })

  it("defers locally when BroadcastChannel is unavailable", async () => {
    vi.stubGlobal("BroadcastChannel", undefined)

    const updateId = await beginPwaUpdateCycle()
    const finishUpdate = vi.fn(async () => {})
    const status = createPwaUpdaterStatus("ready", finishUpdate, { updateId })

    if (status.type === "pwa") {
      status.deferUpdate?.()
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
    expect(setUpdaterStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pwa",
        status: "deferred",
      }),
    )
  })
})
