import { FeedViewType } from "@follow/constants"
import type { Locator } from "@playwright/test"
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
  openMobileSubscriptionDrawerFromEntry,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()
const categoryName = "E2E Touch Targets"

const expectTouchTarget = async (target: Locator) => {
  await expect(target).toBeVisible()
  // Menu transforms can introduce subpixel rounding after the animation ends.
  await expect
    .poll(async () => {
      const bounds = await target.boundingBox()
      return bounds ? Math.min(bounds.width, bounds.height) : 0
    })
    .toBeGreaterThanOrEqual(44 - 0.01)
}

test.describe("responsive touch targets", () => {
  test.beforeEach(async ({ page }) => {
    await installMobileDrawerTestInitScripts(page)
    await installMobileDrawerMockAuth(page, env.apiURL)
    await installMobileDrawerMockEntry(page, env.apiURL)
    const apiHost = new URL(env.apiURL).host
    await page.route(
      (url) => url.host === apiHost && /\/subscriptions\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: [
              {
                feedId: "e2e-mobile-drawer-feed",
                userId: "e2e-mobile-drawer-user",
                view: FeedViewType.Articles,
                category: categoryName,
                title: null,
                isPrivate: false,
                hideFromTimeline: false,
                createdAt: "2026-01-01T00:00:00.000Z",
                feeds: {
                  id: "e2e-mobile-drawer-feed",
                  type: "feed",
                  title: "Folo E2E Feed",
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
  })

  for (const width of [320, 390]) {
    test(`keeps toolbar, folder, and menu targets at least 44px at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
      await ensureMobileDrawerClosed(page)
      await expectTouchTarget(page.getByTestId("mobile-subscription-drawer-entry-trigger"))
      await expectTouchTarget(page.getByRole("button", { name: "Refetch", exact: true }))

      await openMobileSubscriptionDrawerFromEntry(page)
      const drawer = page.locator("#mobile-subscription-drawer")
      const collapse = drawer.getByRole("button", {
        name: `Toggle Folder Collapse: ${categoryName}`,
        exact: true,
      })
      await expectTouchTarget(collapse)
      const expanded = await collapse.getAttribute("aria-expanded")
      await collapse.click()
      await expect(collapse).toHaveAttribute(
        "aria-expanded",
        expanded === "true" ? "false" : "true",
      )

      await expectTouchTarget(drawer.getByTestId("mobile-subscription-drawer-header-trigger"))
      await expectTouchTarget(drawer.getByTestId("profile-menu-trigger"))
      await drawer.getByTestId("profile-menu-trigger").click()
      const menuItems = page.getByRole("menuitem")
      await expect(menuItems.first()).toBeVisible()
      for (const menuItem of await menuItems.all()) {
        await expectTouchTarget(menuItem)
      }
    })
  }

  test("keeps all seven timeline tabs reachable by touch at 320px", async ({ page }) => {
    const apiHost = new URL(env.apiURL).host
    await page.route(
      (url) => url.host === apiHost && /\/subscriptions\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: [FeedViewType.Audios, FeedViewType.Notifications].map((view) => ({
              feedId: `e2e-mobile-timeline-${view}`,
              userId: "e2e-mobile-drawer-user",
              view,
              category: null,
              title: null,
              isPrivate: false,
              hideFromTimeline: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              feeds: {
                id: `e2e-mobile-timeline-${view}`,
                type: "feed",
                title: `Folo E2E ${view}`,
                url: `https://example.com/folo-e2e-${view}.xml`,
                siteUrl: "https://example.com",
                description: null,
                image: null,
                ownerUserId: null,
                errorAt: null,
                errorMessage: null,
              },
            })),
          },
        }),
    )
    await page.setViewportSize({ width: 320, height: 844 })
    await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
    await ensureMobileDrawerClosed(page)
    await openMobileSubscriptionDrawerFromEntry(page)

    const drawer = page.locator("#mobile-subscription-drawer")
    await expect(drawer.locator('[data-testid^="timeline-tab-"]')).toHaveCount(7)
    const notifications = drawer.getByTestId("timeline-tab-notifications")
    const tabsRow = notifications.locator("..")
    await expect(tabsRow).toHaveCSS("overflow-x", "auto")
    await expect
      .poll(() => tabsRow.evaluate((element) => element.scrollWidth > element.clientWidth))
      .toBe(true)
    await expect
      .poll(() =>
        notifications.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const drawerRect = element.closest("#mobile-subscription-drawer")!.getBoundingClientRect()
          return rect.left > drawerRect.right
        }),
      )
      .toBe(true)

    // Scroll the visible tab row explicitly; locator.tap() would scroll hidden ancestors for us.
    await tabsRow.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect.poll(() => tabsRow.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    await expectTouchTarget(notifications)
    await expect
      .poll(() =>
        notifications.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const drawerRect = element.closest("#mobile-subscription-drawer")!.getBoundingClientRect()
          const rowRect = element.parentElement!.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          return (
            rect.left >= drawerRect.left &&
            rect.right <= drawerRect.right &&
            rect.top >= rowRect.top &&
            rect.bottom <= rowRect.bottom &&
            element.contains(hit)
          )
        }),
      )
      .toBe(true)
    const bounds = await notifications.boundingBox()
    expect(bounds).not.toBeNull()
    await page.touchscreen.tap(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
    await expect(page).toHaveURL(/\/timeline\/notifications\/all\/pending$/)
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
  })

  test("keeps an AI-enabled picture feed toolbar usable at 320px", async ({ page }) => {
    const apiHost = new URL(env.apiURL).host
    await page.route(
      (url) => url.host === apiHost && /\/(?:config|status\/configs)\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: { AI_CHAT_ENABLED: true, AI_SHORTCUTS: [], PAYMENT_PLAN_LIST: [] },
          },
        }),
    )
    await page.route(
      (url) => url.host === apiHost && /\/subscriptions\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: [
              {
                feedId: "e2e-mobile-drawer-feed",
                userId: "e2e-mobile-drawer-user",
                view: FeedViewType.Pictures,
                category: categoryName,
                title: null,
                isPrivate: false,
                hideFromTimeline: false,
                createdAt: "2026-01-01T00:00:00.000Z",
                feeds: {
                  id: "e2e-mobile-drawer-feed",
                  type: "feed",
                  title: "Folo E2E Feed",
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
    await page.setViewportSize({ width: 320, height: 844 })
    await openWebApp(page, env, "/timeline/pictures/e2e-mobile-drawer-feed/pending")
    await ensureMobileDrawerClosed(page)

    const header = page.getByTestId("entry-list-header")
    await expect(header).toContainText("Folo E2E Feed")
    await expect(
      header.getByRole("button", { name: "Summarize timeline", exact: true }),
    ).toBeVisible()
    const buttons = header.locator("button:visible")
    expect(await buttons.count()).toBeGreaterThanOrEqual(6)
    for (const button of await buttons.all()) {
      await expectTouchTarget(button)
      const bounds = await button.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
    }

    await header.getByTestId("mobile-local-search-trigger").tap()
    const search = page.getByTestId("local-search-dialog")
    await expect(search).toBeVisible()
    await expect(search.getByTestId("local-search-input")).toBeFocused()
  })

  test("gives reading Back and More Actions buttons named 44px targets", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
    await ensureMobileDrawerClosed(page)
    await page.locator(`[data-entry-id="${MOBILE_DRAWER_E2E_ENTRY_ID}"]`).click()
    await expect(page.getByTestId("entry-render")).toBeVisible()
    await expectTouchTarget(page.getByRole("button", { name: "Back", exact: true }))
    const moreActions = page.getByRole("button", { name: "More Actions", exact: true })
    await expectTouchTarget(moreActions)
    await moreActions.click()
    await expectTouchTarget(page.getByRole("menuitem").first())
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Back", exact: true }).click()
    await expect(page.locator(`[data-entry-id="${MOBILE_DRAWER_E2E_ENTRY_ID}"]`)).toBeVisible()
  })

  test("retains desktop toolbar, folder, and menu heights", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
    const rootFontSize = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    )

    const refetch = page.getByRole("button", { name: "Refetch", exact: true })
    await expect(refetch).toBeVisible()
    expect((await refetch.boundingBox())?.height).toBe(2 * rootFontSize)
    expect((await refetch.boundingBox())?.width).toBe(2 * rootFontSize)
    const collapse = page.getByRole("button", {
      name: `Toggle Folder Collapse: ${categoryName}`,
      exact: true,
    })
    await expect(collapse).toBeVisible()
    expect((await collapse.boundingBox())?.height).toBe(2 * rootFontSize)

    await page.getByTestId("profile-menu-trigger").click()
    const menuItem = page.getByRole("menuitem").first()
    await expect(menuItem).toBeVisible()
    expect((await menuItem.boundingBox())?.height).toBeCloseTo(28, 2)
  })
})
