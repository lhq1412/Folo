import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerClosed,
  installMobileDrawerMockAuth,
  installMobileDrawerMockEntry,
  installMobileDrawerTestInitScripts,
  MOBILE_DRAWER_E2E_ENTRY_ID,
  MOBILE_DRAWER_TIMELINE_ROUTE,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()

test.describe("local search access", () => {
  test.beforeEach(async ({ page }) => {
    await installMobileDrawerTestInitScripts(page)
    await installMobileDrawerMockAuth(page, env.apiURL)
    await installMobileDrawerMockEntry(page, env.apiURL)
  })

  for (const width of [320, 390, 768]) {
    test(`opens, closes, and selects a local entry using touch at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
      await ensureMobileDrawerClosed(page)
      const entry = page.locator(`[data-entry-id="${MOBILE_DRAWER_E2E_ENTRY_ID}"]`)
      await expect(entry).toBeVisible()

      const header = page.getByTestId("entry-list-header")
      const trigger = header.getByTestId("mobile-local-search-trigger")
      await expect(trigger).toBeVisible()
      for (const button of await header.getByRole("button").all()) {
        const bounds = await button.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      }
      const headerBounds = await header.boundingBox()
      const entryBounds = await entry.boundingBox()
      expect(entryBounds!.y).toBeGreaterThanOrEqual(headerBounds!.y + headerBounds!.height)

      await trigger.tap()
      const dialog = page.getByTestId("local-search-dialog")
      const input = dialog.getByTestId("local-search-input")
      await expect(dialog).toBeVisible()
      await expect(input).toBeFocused()
      await dialog.getByTestId("mobile-local-search-close").tap()
      await expect(dialog).toHaveCount(0)

      await trigger.tap()
      await dialog.getByTestId("local-search-type").click()
      await page.getByRole("option", { name: "Entry", exact: true }).click()
      await input.fill("Folo mobile navigation fixture")
      const result = dialog.getByRole("option", { name: /Folo mobile navigation fixture/ })
      await expect(result).toBeVisible()
      await result.tap()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId("entry-render")).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`${MOBILE_DRAWER_E2E_ENTRY_ID}$`))
    })
  }

  test("retains desktop keyboard search without the mobile toolbar entry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
    await expect(page.getByTestId("mobile-local-search-trigger")).toHaveCount(0)
    await page.keyboard.press("Control+k")
    const dialog = page.getByTestId("local-search-dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId("local-search-input")).toBeFocused()
    await expect(dialog.getByTestId("mobile-local-search-close")).toBeHidden()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
  })
})
