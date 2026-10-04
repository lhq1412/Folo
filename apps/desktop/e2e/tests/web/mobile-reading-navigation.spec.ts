import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  installMobileDrawerMockAuth,
  installMobileDrawerMockEntry,
  installMobileDrawerTestInitScripts,
  MOBILE_DRAWER_E2E_ENTRY_ID,
  MOBILE_DRAWER_TIMELINE_ROUTE,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()
const nextEntryId = "41147805272531998"

test.describe("mobile reading navigation", () => {
  test.beforeEach(async ({ page }) => {
    await installMobileDrawerMockAuth(page, env.apiURL)
    await installMobileDrawerMockEntry(page, env.apiURL, [nextEntryId])
  })

  for (const width of [320, 390, 768]) {
    test(`can move between articles and return to the list at ${width}px`, async ({ page }) => {
      await installMobileDrawerTestInitScripts(page)
      await page.setViewportSize({ width, height: 844 })
      await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
      const firstEntry = page.locator(`[data-entry-id="${MOBILE_DRAWER_E2E_ENTRY_ID}"]`)
      await expect(firstEntry).toBeVisible()
      await firstEntry.tap()
      await expect(page.getByTestId("entry-render")).toBeVisible()
      await expect(page.getByTestId("entry-list-header")).toBeHidden()

      const next = page.locator("button").filter({ has: page.locator("i.i-mgc-right-small-sharp") })
      await next.tap()
      await expect(page).toHaveURL(new RegExp(`${nextEntryId}$`))
      await expect(page.getByTestId("entry-render")).toContainText(
        "Folo Mobile Navigation Fixture 2",
      )
      const previous = page
        .locator("button")
        .filter({ has: page.locator("i.i-mgc-left-small-sharp") })
      await previous.tap()
      await expect(page).toHaveURL(new RegExp(`${MOBILE_DRAWER_E2E_ENTRY_ID}$`))
      await page.getByRole("button", { name: "Back", exact: true }).tap()
      await expect(page.getByTestId("entry-list-header")).toBeVisible()
      await expect(firstEntry).toBeVisible()
    })
  }

  test("keeps the drawer closed on repeated mobile page loads", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // Preserve the initialization marker across reloads, as a real browser does.
    await page.addInitScript(() => {
      localStorage.setItem("follow:mobile-layout-initialized", "1")
      localStorage.setItem("follow:ai-onboarding:dismissed:e2e-mobile-drawer-user", "1")
    })
    await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
    const drawer = page.locator("#mobile-subscription-drawer")
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await page.reload()
    await expect(page.getByTestId("entry-list-header")).toBeVisible({ timeout: 30_000 })
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(page.locator("main")).not.toHaveAttribute("inert", "")
    await page.getByTestId("mobile-local-search-trigger").tap()
    await expect(page.getByTestId("local-search-dialog")).toBeVisible()
  })
})
