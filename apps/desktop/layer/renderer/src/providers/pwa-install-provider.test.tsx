import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  isPwaInstallCooldownActive,
  markPwaInstallDismissed,
  markPwaInstalled,
  readPwaInstallRecord,
  recordPwaVisit,
  resetPwaInstallRecordForTests,
} from "~/lib/pwa/install-state"

import { PwaInstallProvider } from "./pwa-install-provider"

vi.mock("~/lib/pwa/platform", () => ({
  isStandaloneDisplayMode: vi.fn(() => false),
  isIosSafariInstallContext: vi.fn(() => false),
  isChromiumInstallContext: vi.fn(() => true),
  isIosDevice: vi.fn(() => false),
}))

const dispatchBeforeInstallPrompt = () => {
  window.dispatchEvent(new Event("beforeinstallprompt"))
}

describe("PwaInstallProvider beforeinstallprompt handling", () => {
  const roots: Root[] = []

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await act(async () => {
        root.unmount()
      })
    }

    resetPwaInstallRecordForTests()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    resetPwaInstallRecordForTests()
  })

  const renderProvider = async () => {
    const container = document.createElement("div")
    document.body.append(container)

    const root = createRoot(container)
    await act(async () => {
      root.render(
        <PwaInstallProvider>
          <div />
        </PwaInstallProvider>,
      )
    })

    roots.push(root)
    return root
  }

  it("preserves dismissal cooldown when only dismissedAt exists", async () => {
    markPwaInstallDismissed(1_000)
    recordPwaVisit()
    recordPwaVisit()

    await renderProvider()
    dispatchBeforeInstallPrompt()

    const record = readPwaInstallRecord()
    expect(record.dismissedAt).toBe(1_000)
    expect(isPwaInstallCooldownActive(record, 2_000)).toBe(true)
  })

  it("clears stale installed hints when browser offers reinstall", async () => {
    markPwaInstalled(1_000)
    recordPwaVisit()
    recordPwaVisit()

    await renderProvider()
    dispatchBeforeInstallPrompt()

    const record = readPwaInstallRecord()
    expect(record.installedAt).toBeNull()
    expect(record.dismissedAt).toBeNull()
  })

  it("clears legacy install-derived dismissal when stale installedAt exists", async () => {
    localStorage.setItem(
      "folo-pwa-install-v1",
      JSON.stringify({
        version: 1,
        installedAt: 1_000,
        dismissedAt: 2_000,
        lastPromptAt: 2_000,
        promptCount: 1,
        visitCount: 2,
      }),
    )

    await renderProvider()
    dispatchBeforeInstallPrompt()

    const record = readPwaInstallRecord()
    expect(record.installedAt).toBeNull()
    expect(record.dismissedAt).toBeNull()
  })
})
