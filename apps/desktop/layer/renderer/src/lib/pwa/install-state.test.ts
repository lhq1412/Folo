import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  clearStaleInstalledHint,
  isPwaInstallCooldownActive,
  markPwaInstallDismissed,
  markPwaInstalled,
  PWA_INSTALL_COOLDOWN_MS,
  readPwaInstallRecord,
  recordPwaVisit,
  resetPwaInstallRecordForTests,
} from "./install-state"

describe("install-state", () => {
  beforeEach(() => {
    resetPwaInstallRecordForTests()
  })

  afterEach(() => {
    resetPwaInstallRecordForTests()
  })

  it("clears stale installed hints for browser reinstall flows", () => {
    markPwaInstalled(1_000)
    const cleared = clearStaleInstalledHint()

    expect(cleared.installedAt).toBeNull()
    expect(readPwaInstallRecord().installedAt).toBeNull()
  })

  it("persists dismissal across reads", () => {
    markPwaInstallDismissed(1_000)
    const record = readPwaInstallRecord()
    expect(record.dismissedAt).toBe(1_000)
    expect(record.promptCount).toBe(1)
  })

  it("tracks visit count", () => {
    recordPwaVisit()
    recordPwaVisit()
    expect(readPwaInstallRecord().visitCount).toBe(2)
  })

  it("respects cooldown window", () => {
    const dismissedAt = 10_000
    markPwaInstallDismissed(dismissedAt)

    expect(
      isPwaInstallCooldownActive(readPwaInstallRecord(), dismissedAt + PWA_INSTALL_COOLDOWN_MS - 1),
    ).toBe(true)

    expect(
      isPwaInstallCooldownActive(readPwaInstallRecord(), dismissedAt + PWA_INSTALL_COOLDOWN_MS),
    ).toBe(false)
  })
})
