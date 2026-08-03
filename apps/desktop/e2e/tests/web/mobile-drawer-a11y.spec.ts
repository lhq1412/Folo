import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerTimelineReady,
  openMobileSubscriptionDrawerFromEntry,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()

const viewportCases = [
  { width: 320, height: 568, expected: "mobile" },
  { width: 390, height: 844, expected: "mobile" },
  { width: 1024, height: 768, expected: "desktop" },
] as const

const focusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

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

  test("opens the drawer from a native click", async ({ page }) => {
    const drawer = page.locator("#mobile-subscription-drawer")

    await openMobileSubscriptionDrawerFromEntry(page, { method: "click" })
    await expect(drawer).toHaveAttribute("aria-modal", "true")
  })

  test("opens the drawer from the keyboard Enter key", async ({ page }) => {
    const drawer = page.locator("#mobile-subscription-drawer")

    await openMobileSubscriptionDrawerFromEntry(page, { method: "enter" })
    await expect(drawer).toHaveAttribute("aria-modal", "true")
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

  test("traps focus inside the drawer while it is open", async ({ page }) => {
    const drawer = page.locator("#mobile-subscription-drawer")

    await openMobileSubscriptionDrawerFromEntry(page)
    await expect(drawer).toHaveAttribute("aria-modal", "true")

    const focusableCount = await drawer.evaluate((element, selector) => {
      return [...element.querySelectorAll<HTMLElement>(selector)].filter(
        (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
      ).length
    }, focusableSelector)

    expect(focusableCount).toBeGreaterThanOrEqual(2)

    await drawer.evaluate((element, selector) => {
      const nodes = [...element.querySelectorAll<HTMLElement>(selector)].filter(
        (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
      )
      nodes.at(-1)?.focus()
    }, focusableSelector)
    await page.keyboard.press("Tab")
    await expect(drawer).toHaveAttribute("aria-modal", "true")
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)

    await drawer.evaluate((element, selector) => {
      const nodes = [...element.querySelectorAll<HTMLElement>(selector)].filter(
        (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
      )
      nodes[0]?.focus()
    }, focusableSelector)
    await page.keyboard.press("Shift+Tab")
    await expect(drawer).toHaveAttribute("aria-modal", "true")
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)

    for (let index = 0; index < focusableCount + 2; index += 1) {
      await page.keyboard.press("Tab")
      await expect(drawer).toHaveAttribute("aria-modal", "true")
      expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      )
    }
  })

  test("closes the drawer after navigating from inside the drawer", async ({ page }) => {
    const drawer = page.locator("#mobile-subscription-drawer")
    const main = page.locator("main")
    const entryTrigger = page.locator(
      '[data-testid="mobile-subscription-drawer-entry-trigger"]:visible',
    )
    const articlesTab = page.locator(
      '#mobile-subscription-drawer [data-testid="timeline-tab-articles"]',
    )
    const videosTab = page.locator(
      '#mobile-subscription-drawer [data-testid="timeline-tab-videos"]',
    )

    await openMobileSubscriptionDrawerFromEntry(page)
    await expect(drawer).toHaveAttribute("aria-modal", "true")
    await expect(main).toHaveAttribute("inert", "")
    await expect(articlesTab).toHaveAttribute("aria-pressed", "true")
    await expect(videosTab).toBeVisible()

    await videosTab.click()

    await expect(page).toHaveURL(/\/timeline\/videos\//)
    await expect(videosTab).toHaveAttribute("aria-pressed", "true")
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(drawer).not.toHaveAttribute("aria-modal", "true")
    await expect(main).not.toHaveAttribute("inert", "")
    await expect(main).not.toHaveAttribute("aria-hidden", "true")
    await expect(entryTrigger).toBeVisible()
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
