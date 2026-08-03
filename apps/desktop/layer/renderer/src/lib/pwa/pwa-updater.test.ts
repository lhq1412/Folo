import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setUpdaterStatus } from "~/atoms/updater"

import { createPwaUpdaterStatus } from "./pwa-updater"
import { beginPwaUpdateCycle, isPwaUpdateDeferredForSession } from "./update-coordinator"

vi.mock("~/atoms/updater", () => ({
  setUpdaterStatus: vi.fn(),
}))

describe("pwa-updater", () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it("creates deferred updater state and persists session deferral", () => {
    const updateId = beginPwaUpdateCycle()
    const finishUpdate = vi.fn(async () => {})
    const status = createPwaUpdaterStatus("ready", finishUpdate, { updateId })

    expect(status.type).toBe("pwa")
    expect(status.status).toBe("ready")

    if (status.type === "pwa") {
      status.deferUpdate?.()
    }

    expect(isPwaUpdateDeferredForSession(updateId)).toBe(true)
    expect(setUpdaterStatus).not.toHaveBeenCalled()
  })
})
