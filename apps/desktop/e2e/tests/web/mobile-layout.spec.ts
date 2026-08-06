import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"

const env = resolveDesktopE2EEnv()

const viewportCases = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
] as const

test.describe("mobile shell geometry", () => {
  for (const viewport of viewportCases) {
    test(`shell height matches viewport at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openWebApp(page, env)

      const shell = page.locator("#follow-root-container")
      await expect(shell).toBeVisible()

      await expect
        .poll(() =>
          shell.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return Math.round(rect.height)
          }),
        )
        .toBe(viewport.height)
    })
  }

  test("main content owns the top safe-area boundary on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    const mainOwner = page.locator('main[data-safe-area-owner="main-top"]')
    await expect(mainOwner).toBeVisible()
    await expect(mainOwner).toHaveClass(/app-safe-top/)
  })

  test("mobile viewport bootstrap remains stable after resize", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
      .toBe("mobile")

    await page.setViewportSize({ width: 1024, height: 768 })
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
      .toBe("desktop")

    await page.setViewportSize({ width: 390, height: 844 })
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
      .toBe("mobile")

    const shell = page.locator("#follow-root-container")
    await expect
      .poll(() => shell.evaluate((element) => Math.round(element.getBoundingClientRect().height)))
      .toBe(844)
  })

  test("sets display mode dataset on load", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.dataset.displayMode))
      .toBe("browser")
  })
})

/**
 * WebKit DOM/CSS invariants only. This does not reproduce iOS Home Screen standalone
 * status-bar and safe-area behavior exactly.
 */
