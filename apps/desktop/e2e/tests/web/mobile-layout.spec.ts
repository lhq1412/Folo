import { FeedViewType } from "@follow/constants"
import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerClosed,
  installMobileDrawerMockAuth,
  installMobileDrawerTestInitScripts,
  openMobileSubscriptionDrawerFromEntry,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()

const viewportCases = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 834, height: 1194 },
  { width: 1024, height: 768 },
  { width: 1024, height: 1366 },
] as const

const breakpointCases = [
  { width: 1023, height: 1366, expected: "mobile" },
  { width: 1024, height: 1366, expected: "desktop" },
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
      await expect(shell).toHaveClass(/app-shell/)

      await expect
        .poll(() =>
          shell.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return Math.round(rect.height)
          }),
        )
        .toBe(viewport.height)

      await expect
        .poll(() =>
          shell.evaluate((element) => {
            const style = getComputedStyle(element)
            return {
              height: Math.round(Number.parseFloat(style.height)),
              maxHeight: Math.round(Number.parseFloat(style.maxHeight)),
            }
          }),
        )
        .toEqual({
          height: viewport.height,
          maxHeight: viewport.height,
        })
    })
  }

  test("main content owns the top safe-area boundary on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    const mainOwner = page.locator('main[data-safe-area-owner="main-top"]')
    await expect(mainOwner).toBeVisible()
    await expect(mainOwner).toHaveClass(/app-safe-top/)
  })

  test("drawer content keeps base gutter without duplicating top safe-area padding", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    const drawerContent = page.locator("#mobile-subscription-drawer .relative.flex.h-full")
    await expect(drawerContent).toBeVisible()

    const padding = await drawerContent.evaluate((element) => {
      const style = getComputedStyle(element)
      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      const paddingTop = Number.parseFloat(style.paddingTop)

      return {
        paddingTop,
        expected: rootFontSize * 0.625,
      }
    })

    expect(padding.paddingTop).toBeCloseTo(padding.expected, 1)
  })

  test("mobile drawer shell spans viewport top without extra safe-area offset", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--app-safe-top", "47px")
    })

    const drawerShell = page.locator('[data-safe-area-owner="mobile-drawer-bottom"]')
    await expect(drawerShell).toBeVisible()

    await expect
      .poll(() =>
        drawerShell.evaluate((element) => Math.round(element.getBoundingClientRect().top)),
      )
      .toBe(0)

    const shellGeometry = await drawerShell.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        paddingTop: style.paddingTop,
        top: style.top,
        bottom: Math.round(rect.bottom),
        viewportHeight: window.innerHeight,
      }
    })

    expect(shellGeometry.paddingTop).toBe("0px")
    expect(shellGeometry.top).toBe("0px")
    expect(shellGeometry.bottom).toBe(shellGeometry.viewportHeight)
  })

  test("mobile drawer shell bottom respects injected safe-area bottom", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--app-safe-bottom", "34px")
    })

    const drawerShell = page.locator('[data-safe-area-owner="mobile-drawer-bottom"]')
    await expect(drawerShell).toBeVisible()

    await expect
      .poll(() => drawerShell.evaluate((element) => getComputedStyle(element).paddingBottom))
      .toBe("34px")

    const shellStyles = await drawerShell.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        paddingBottom: style.paddingBottom,
        bottom: Math.round(rect.bottom),
        viewportHeight: window.innerHeight,
      }
    })

    expect(shellStyles.paddingBottom).toBe("34px")
    expect(shellStyles.bottom).toBe(shellStyles.viewportHeight)
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

  for (const breakpoint of breakpointCases) {
    test(`responsive branch at ${breakpoint.width}px uses ${breakpoint.expected} layout`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height })
      await openWebApp(page, env)

      await expect
        .poll(async () => page.evaluate(() => document.documentElement.dataset.viewport))
        .toBe(breakpoint.expected)

      const shell = page.locator("#follow-root-container")
      await expect(shell).toBeVisible()
      await expect
        .poll(() => shell.evaluate((element) => Math.round(element.getBoundingClientRect().height)))
        .toBe(breakpoint.height)

      if (breakpoint.expected === "mobile") {
        const drawerShell = page.locator('[data-safe-area-owner="mobile-drawer-bottom"]')
        await expect(drawerShell).toBeVisible()
        await expect
          .poll(() =>
            drawerShell.evaluate((element) => Math.round(element.getBoundingClientRect().top)),
          )
          .toBe(0)
      }
    })
  }

  test("print mode removes viewport max-height constraint from shell", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)

    const shell = page.locator("#follow-root-container")
    await page.emulateMedia({ media: "print" })

    await expect
      .poll(() =>
        shell.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            maxHeight: style.maxHeight,
            overflow: style.overflow,
          }
        }),
      )
      .toEqual({
        maxHeight: "none",
        overflow: "visible",
      })
  })
})

test.describe("mobile settings layout", () => {
  test.beforeEach(async ({ page }) => {
    await installMobileDrawerTestInitScripts(page)
    await installMobileDrawerMockAuth(page, env.apiURL)
  })

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    test(`keeps settings usable at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openWebApp(page, env)
      await ensureMobileDrawerClosed(page)
      await openMobileSubscriptionDrawerFromEntry(page)
      await page.getByTestId("profile-menu-trigger").click()
      await page.getByTestId("profile-menu-preferences").click()

      const settings = page.getByTestId("mobile-settings")
      await expect(settings).toBeVisible()
      await expect(page.getByTestId("settings-categories")).toBeVisible()
      await page.getByTestId("settings-tab-general").click()
      const languageSelect = page.getByTestId("settings-language-select")
      await expect(languageSelect).toBeVisible()
      const bounds = await languageSelect.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
      const nativeSelect = languageSelect.locator("select")
      const language = await nativeSelect.inputValue()
      await nativeSelect.selectOption(language)

      await page.getByTestId("settings-categories-back").click()
      await expect(page.getByTestId("settings-categories")).toBeVisible()
      await page.getByTestId("settings-tab-appearance").click()
      await expect(page.getByTestId("settings-categories")).toHaveCount(0)
      await settings.getByTestId("modal-close").click()
      await expect(settings).toHaveCount(0)
    })
  }

  test("keeps the rightmost subscribed feed column reachable at 390px", async ({ page }) => {
    const apiHost = new URL(env.apiURL).host
    const feedId = "e2e-mobile-settings-feed"
    await page.route(
      (url) => url.host === apiHost && /\/subscriptions\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: [
              {
                feedId,
                userId: "e2e-mobile-drawer-user",
                view: FeedViewType.Articles,
                category: null,
                title: null,
                isPrivate: false,
                hideFromTimeline: false,
                createdAt: "2026-01-01T00:00:00.000Z",
                feeds: {
                  id: feedId,
                  type: "feed",
                  title: "Folo mobile settings fixture",
                  url: "https://example.com/folo-e2e.xml",
                  siteUrl: "https://example.com",
                  description: null,
                  image: null,
                  ownerUserId: null,
                  errorAt: null,
                  errorMessage: null,
                },
              },
            ],
          },
        }),
    )
    await page.route(
      (url) => url.host === apiHost && /\/feeds\/analytics\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: { analytics: { [feedId]: { subscriptionCount: 12, updatesPerWeek: 7 } } },
          },
        }),
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)
    await ensureMobileDrawerClosed(page)
    await openMobileSubscriptionDrawerFromEntry(page)
    await page.getByTestId("profile-menu-trigger").click()
    await page.getByTestId("profile-menu-preferences").click()
    await page.getByTestId("settings-tab-feeds").click()

    const settings = page.getByTestId("mobile-settings")
    const row = settings.getByTestId(`settings-feed-row-${feedId}`)
    await expect(row).toBeVisible()
    await row.scrollIntoViewIfNeeded()
    const header = settings.locator(".sticky.grid").first()
    const rowBounds = await row.boundingBox()
    const headerBounds = await header.boundingBox()
    expect(rowBounds).not.toBeNull()
    expect(headerBounds).not.toBeNull()
    expect(rowBounds!.width).toBeCloseTo(headerBounds!.width, 1)

    const viewport = settings.locator("[data-radix-scroll-area-viewport]").first()
    const overflow = await viewport.evaluate((element) => element.scrollWidth > element.clientWidth)
    expect(overflow).toBe(true)
    await viewport.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)

    const lastCell = row.locator(":scope > div").last()
    await expect(lastCell).toContainText("7/w")
    await expect
      .poll(() =>
        lastCell.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const hit = document.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          )
          return hit !== null && element.contains(hit)
        }),
      )
      .toBe(true)
  })

  test("preserves the desktop settings sidebar and controls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWebApp(page, env)
    await page.getByTestId("profile-menu-trigger").click()
    await page.getByTestId("profile-menu-preferences").click()

    await expect(page.getByTestId("mobile-settings")).toHaveCount(0)
    await expect(page.getByTestId("settings-tab-general")).toBeVisible()
    await expect(page.getByTestId("settings-language-select")).toBeVisible()
    await page.getByTestId("settings-tab-appearance").click()
    await page.getByTestId("modal-close").click()
    await expect(page.locator("#setting-modal")).toHaveCount(0)
  })
})

/**
 * WebKit/Chromium DOM/CSS ownership invariants only. These tests do not reproduce
 * iOS Home Screen standalone status-bar and safe-area behavior exactly.
 */
