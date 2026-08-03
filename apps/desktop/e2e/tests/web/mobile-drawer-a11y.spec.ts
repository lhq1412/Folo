import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"

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
  test.use({
    viewport: { width: 390, height: 844 },
  })

  test("restores focus to the entry trigger after Escape and backdrop close", async ({ page }) => {
    await openWebApp(page, env)

    const entryTrigger = page.locator(
      '[data-testid="mobile-subscription-drawer-entry-trigger"]:visible',
    )
    const drawer = page.locator("#mobile-subscription-drawer")

    const hasEntryTrigger = await entryTrigger.isVisible().catch(() => false)
    test.skip(
      !hasEntryTrigger,
      "Requires authenticated timeline view with mobile entry header trigger",
    )

    await entryTrigger.click()
    await expect(drawer).toHaveAttribute("aria-modal", "true")

    await page.keyboard.press("Escape")
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(entryTrigger).toBeFocused()

    await entryTrigger.click()
    await expect(drawer).toHaveAttribute("aria-modal", "true")

    await page.mouse.click(350, 400)
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(entryTrigger).toBeFocused()
  })

  test("traps focus inside the drawer while it is open", async ({ page }) => {
    await openWebApp(page, env)

    const entryTrigger = page.locator(
      '[data-testid="mobile-subscription-drawer-entry-trigger"]:visible',
    )
    const drawer = page.locator("#mobile-subscription-drawer")

    const hasEntryTrigger = await entryTrigger.isVisible().catch(() => false)
    test.skip(
      !hasEntryTrigger,
      "Requires authenticated timeline view with mobile entry header trigger",
    )

    await entryTrigger.click()
    await expect(drawer).toHaveAttribute("aria-modal", "true")
    await expect(drawer).not.toHaveAttribute("aria-hidden", "true")

    const focusableCount = await drawer.evaluate((element) => {
      const selector =
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      return [...element.querySelectorAll<HTMLElement>(selector)].filter(
        (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
      ).length
    })
    test.skip(focusableCount < 2, "Requires at least two focusable controls inside the drawer")

    for (let index = 0; index < focusableCount + 2; index += 1) {
      await page.keyboard.press("Tab")
      const isInsideDrawer = await drawer.evaluate((element) =>
        element.contains(document.activeElement),
      )
      expect(isInsideDrawer).toBe(true)
    }
  })

  test("keeps closed drawer controls out of the tab order", async ({ page }) => {
    await openWebApp(page, env)

    const entryTrigger = page.locator(
      '[data-testid="mobile-subscription-drawer-entry-trigger"]:visible',
    )
    const drawer = page.locator("#mobile-subscription-drawer")

    const hasEntryTrigger = await entryTrigger.isVisible().catch(() => false)
    test.skip(
      !hasEntryTrigger,
      "Requires authenticated timeline view with mobile entry header trigger",
    )

    await expect(drawer).toHaveAttribute("aria-hidden", "true")

    await entryTrigger.focus()
    await page.keyboard.press("Tab")

    const activeId = await page.evaluate(() => document.activeElement?.id ?? "")
    expect(activeId).not.toBe("mobile-subscription-drawer")
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(false)
  })
})
