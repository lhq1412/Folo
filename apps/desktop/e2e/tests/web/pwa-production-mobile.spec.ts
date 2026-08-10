import { expect, test } from "@playwright/test"

import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerClosed,
  installMobileDrawerMockEntry,
  MOBILE_DRAWER_E2E_ENTRY_ID,
  MOBILE_DRAWER_TIMELINE_ROUTE,
  openMobileSubscriptionDrawerFromEntry,
} from "../../support/mobile-drawer-fixture"
import { buildProdWebAppURL } from "../../support/prod-web-env"
import {
  installProdPwaMockSession,
  waitForRenderedProdAppShell,
  waitForServiceWorkerController,
} from "../../support/pwa-production"
import { MOBILE_PWA_PROD_AUTH_FILE } from "../../support/pwa-production-mobile-fixture"

test.describe("production PWA mobile navigation", () => {
  test.describe.configure({ timeout: 180_000 })

  test.use({
    storageState: MOBILE_PWA_PROD_AUTH_FILE,
    viewport: { width: 390, height: 844 },
  })

  test.beforeEach(async ({ page }) => {
    await installProdPwaMockSession(page)
    await page.goto(buildProdWebAppURL(MOBILE_DRAWER_TIMELINE_ROUTE), {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedProdAppShell(page)
    await waitForServiceWorkerController(page)
    await ensureMobileDrawerClosed(page)
  })

  test("keeps service worker control while interacting with the subscription drawer", async ({
    page,
  }) => {
    const drawer = page.locator("#mobile-subscription-drawer")

    await openMobileSubscriptionDrawerFromEntry(page)
    await expect(drawer).toHaveAttribute("aria-modal", "true")

    await page.keyboard.press("Escape")
    await expect(drawer).toHaveAttribute("aria-hidden", "true")

    await expect
      .poll(async () => page.evaluate(() => navigator.serviceWorker.controller?.state ?? null))
      .toBe("activated")
  })

  test("closes the drawer after in-drawer navigation", async ({ page }) => {
    const drawer = page.locator("#mobile-subscription-drawer")
    const videosTab = page.locator(
      '#mobile-subscription-drawer [data-testid="timeline-tab-videos"]',
    )

    await openMobileSubscriptionDrawerFromEntry(page)
    await videosTab.click()

    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(page).toHaveURL(/\/timeline\/videos\//)
  })

  test("opens an entry and returns to the mobile list with service worker control", async ({
    page,
  }) => {
    const env = resolveDesktopE2EEnv()
    await installMobileDrawerMockEntry(page, env.apiURL)
    await page.goto(buildProdWebAppURL(MOBILE_DRAWER_TIMELINE_ROUTE), {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedProdAppShell(page)
    await waitForServiceWorkerController(page)

    const entry = page.locator(`[data-entry-id="${MOBILE_DRAWER_E2E_ENTRY_ID}"]`)
    await expect(entry).toBeVisible({ timeout: 30_000 })
    await entry.locator("a[href]").click()

    await expect(page.getByTestId("entry-render")).toBeVisible()
    await page.getByRole("button", { name: "Back to list" }).click()
    await expect(entry).toBeVisible()

    await expect
      .poll(async () => page.evaluate(() => navigator.serviceWorker.controller?.state ?? null))
      .toBe("activated")
  })
})
