import { expect, test } from "@playwright/test"

import { tryDeleteCurrentUser } from "../../support/account"
import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerTimelineReady,
  openMobileSubscriptionDrawerFromEntry,
  resolveMobileDrawerTestAccount,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()

const viewportCases = [
  { width: 320, height: 568, expected: "mobile" },
  { width: 390, height: 844, expected: "mobile" },
  { width: 1024, height: 768, expected: "desktop" },
] as const

test.describe("mobile viewport bootstrap", () => {
  for (const viewport of viewportCases) {
    test(`sets data-viewport=${viewport.expected} at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openWebApp(page, env)

      await expect
        .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
        .toBe(viewport.expected)
    })
  }
})

test.describe("mobile subscription drawer a11y", () => {
  test.describe.configure({ timeout: 180_000 })

  test.use({
    viewport: { width: 390, height: 844 },
  })

  test.beforeEach(async ({ page }) => {
    await ensureMobileDrawerTimelineReady(page, env)
  })

  test.afterAll(async ({ browser }) => {
    const fixedAccount = resolveMobileDrawerTestAccount()
    if (!fixedAccount) {
      return
    }

    const context = await browser.newContext()
    const page = await context.newPage()
    await ensureMobileDrawerTimelineReady(page, env)
    await tryDeleteCurrentUser(page, env).catch(() => {})
    await context.close()
  })

  test("moves focus into the drawer immediately after open", async ({ page }) => {
    const drawer = page.locator("#mobile-subscription-drawer")

    await openMobileSubscriptionDrawerFromEntry(page)
    await expect(drawer).not.toHaveAttribute("aria-hidden", "true")
    await expect
      .poll(() => drawer.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true)

    const activeElementTag = await page.evaluate(() => document.activeElement?.tagName ?? "")
    expect(activeElementTag).not.toBe("BODY")

    const activeElementId = await page.evaluate(() => document.activeElement?.id ?? "")
    expect(activeElementId).not.toBe("mobile-subscription-drawer-entry-trigger")
  })

  test("restores focus to the entry trigger after Escape and backdrop close", async ({ page }) => {
    const entryTrigger = page.locator(
      '[data-testid="mobile-subscription-drawer-entry-trigger"]:visible',
    )
    const drawer = page.locator("#mobile-subscription-drawer")

    await openMobileSubscriptionDrawerFromEntry(page)

    await page.keyboard.press("Escape")
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(entryTrigger).toBeFocused()

    await openMobileSubscriptionDrawerFromEntry(page)

    await page.mouse.click(350, 400)
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(entryTrigger).toBeFocused()
  })

  test("isolates page content while the drawer is open", async ({ page }) => {
    const drawer = page.locator("#mobile-subscription-drawer")
    const main = page.locator("main")

    await openMobileSubscriptionDrawerFromEntry(page)
    await expect(drawer).toHaveAttribute("aria-modal", "true")
    await expect(main).toHaveAttribute("inert", "")
    await expect(main).toHaveAttribute("aria-hidden", "true")
  })

  test("keeps closed drawer controls out of the tab order", async ({ page }) => {
    const entryTrigger = page.locator(
      '[data-testid="mobile-subscription-drawer-entry-trigger"]:visible',
    )
    const drawer = page.locator("#mobile-subscription-drawer")

    await expect(drawer).toHaveAttribute("aria-hidden", "true")

    await entryTrigger.focus()
    await page.keyboard.press("Tab")

    const activeId = await page.evaluate(() => document.activeElement?.id ?? "")
    expect(activeId).not.toBe("mobile-subscription-drawer")
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(false)
  })
})
