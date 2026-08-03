import { describe, expect, it, vi } from "vitest"

import { createPwaUpdaterStatus } from "./pwa-updater"
import { isPwaUpdateDeferredForSession } from "./update-coordinator"

describe("pwa-updater", () => {
  it("creates deferred updater state and persists session deferral", () => {
    const finishUpdate = vi.fn(async () => {})
    const status = createPwaUpdaterStatus("ready", finishUpdate)

    expect(status.type).toBe("pwa")
    expect(status.status).toBe("ready")

    if (status.type === "pwa") {
      status.deferUpdate?.()
    }
    expect(isPwaUpdateDeferredForSession()).toBe(true)
  })
})
