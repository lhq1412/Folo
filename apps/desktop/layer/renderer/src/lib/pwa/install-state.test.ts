import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  clearInstallDismissalForReinstall,
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
    expect(cleared.dismissedAt).toBeNull()
    expect(readPwaInstallRecord().installedAt).toBeNull()
  })

  it("does not set dismissedAt when marking installed", () => {
    markPwaInstalled(1_000)
    expect(readPwaInstallRecord().dismissedAt).toBeNull()
  })

  it("clears install dismissal when browser offers reinstall", () => {
    markPwaInstallDismissed(1_000)
    const cleared = clearInstallDismissalForReinstall()

    expect(cleared.dismissedAt).toBeNull()
    expect(isPwaInstallCooldownActive(cleared, 2_000)).toBe(false)
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
