import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  isPwaInstallCooldownActive,
  markPwaInstallDismissed,
  markPwaInstalled,
  PWA_INSTALL_ENGAGEMENT_DELAY_MS,
  readPwaInstallRecord,
  recordPwaVisit,
  resetPwaInstallRecordForTests,
} from "~/lib/pwa/install-state"

import { PwaInstallProvider, usePwaInstall } from "./pwa-install-provider"

let installHandler: (() => Promise<void>) | null = null

function InstallProbe() {
  const { install } = usePwaInstall()
  installHandler = install
  return null
}

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
    vi.useRealTimers()
    installHandler = null
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

  const renderProviderWithInstallProbe = async () => {
    const container = document.createElement("div")
    document.body.append(container)

    const root = createRoot(container)
    await act(async () => {
      root.render(
        <PwaInstallProvider>
          <InstallProbe />
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

  it("marks installed only after appinstalled, not when userChoice is accepted", async () => {
    vi.useFakeTimers()
    recordPwaVisit()
    recordPwaVisit()

    const prompt = vi.fn(async () => {})
    const deferredPrompt = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
    })

    await renderProviderWithInstallProbe()
    await act(async () => {
      vi.advanceTimersByTime(PWA_INSTALL_ENGAGEMENT_DELAY_MS)
    })
    await act(async () => {
      window.dispatchEvent(deferredPrompt)
    })

    await act(async () => {
      await installHandler?.()
    })

    expect(prompt).toHaveBeenCalled()
    expect(readPwaInstallRecord().installedAt).toBeNull()

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"))
    })

    expect(readPwaInstallRecord().installedAt).not.toBeNull()
  })
})
