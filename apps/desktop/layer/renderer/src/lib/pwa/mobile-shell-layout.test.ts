import { readFileSync } from "node:fs"

import { join } from "pathe"
import { describe, expect, test } from "vitest"

const rendererRoot = join(import.meta.dirname, "../..")

const layoutSourceFiles = [
  "styles/base.css",
  "modules/app-layout/MainDestopLayout.tsx",
  "modules/entry-column/layouts/EntryListHeader.tsx",
  "modules/app-layout/ai-enhanced-timeline/MobileTimelineLayout.tsx",
  "modules/subscription-column/index.tsx",
  "modules/app-layout/subscription-column/SubscriptionColumn.tsx",
]

function readRendererSource(relativePath: string) {
  return readFileSync(join(rendererRoot, relativePath), "utf8")
}

describe("mobile shell layout ownership", () => {
  test("uses a single app-shell viewport height owner", () => {
    const mainLayout = readRendererSource("modules/app-layout/MainDestopLayout.tsx")
    const baseCss = readRendererSource("styles/base.css")

    expect(mainLayout).toContain("app-shell")
    expect(baseCss).toContain("--app-viewport-height")
    expect(baseCss).toContain(".app-shell")
    expect(mainLayout).not.toContain("h-dvh")
    expect(mainLayout).not.toContain("lg:h-screen")
    expect(mainLayout).not.toContain("print:h-auto")
  })

  test("does not distribute mobile dvh ownership across body and root", () => {
    const baseCss = readRendererSource("styles/base.css")

    expect(baseCss).not.toContain("min-h-dvh")
    expect(baseCss).not.toContain("100svh")
    expect(baseCss).not.toMatch(/@media \(display-mode: standalone\)/)
  })

  test("keeps safe-area compensation out of nested mobile headers", () => {
    const entryListHeader = readRendererSource("modules/entry-column/layouts/EntryListHeader.tsx")
    const mobileTimelineLayout = readRendererSource(
      "modules/app-layout/ai-enhanced-timeline/MobileTimelineLayout.tsx",
    )

    expect(entryListHeader).not.toContain("safe-area-inset")
    expect(mobileTimelineLayout).not.toContain("safe-area-inset")
  })

  test("documents safe-area owners for main and drawer render paths", () => {
    const mainLayout = readRendererSource("modules/app-layout/MainDestopLayout.tsx")
    const subscriptionColumnContainer = readRendererSource(
      "modules/app-layout/subscription-column/SubscriptionColumn.tsx",
    )
    const subscriptionColumn = readRendererSource("modules/subscription-column/index.tsx")

    expect(mainLayout).toContain('data-safe-area-owner="main-top"')
    expect(mainLayout).toContain("max-lg:app-safe-top")
    expect(subscriptionColumnContainer).toContain('"mobile-drawer-shell"')
    expect(subscriptionColumnContainer).toContain("top-[var(--app-safe-top)]")
    expect(subscriptionColumnContainer).toContain("pb-[var(--app-safe-bottom)]")
    expect(subscriptionColumn).not.toContain("var(--app-safe-top)")
    expect(subscriptionColumn).toContain("pt-2.5")
  })

  test("releases shell max-height constraints in print mode", () => {
    const baseCss = readRendererSource("styles/base.css")

    expect(baseCss).toMatch(/@media print[\s\S]*\.app-shell[\s\S]*max-height:\s*none/)
    expect(baseCss).toMatch(/@media print[\s\S]*\.app-shell[\s\S]*height:\s*auto/)
  })

  test("limits direct env(safe-area-inset) usage to shell variables", () => {
    const offenders = layoutSourceFiles.filter((file) => {
      const source = readRendererSource(file)
      return /env\(safe-area-inset/.test(source)
    })

    expect(offenders).toEqual(["styles/base.css"])
  })
})
