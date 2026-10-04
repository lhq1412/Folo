import { FeedViewType } from "@follow/constants"
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

  test("keeps search controls separate from Enter result selection", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
    await ensureMobileDrawerClosed(page)
    await expect(page.locator(`[data-entry-id="${MOBILE_DRAWER_E2E_ENTRY_ID}"]`)).toBeVisible()

    const trigger = page.getByTestId("mobile-local-search-trigger")
    const dialog = page.getByTestId("local-search-dialog")
    const input = dialog.getByTestId("local-search-input")
    const close = dialog.getByTestId("mobile-local-search-close")
    const initialURL = page.url()
    await trigger.click()
    await dialog.getByTestId("local-search-type").click()
    await page.getByRole("option", { name: "Entry", exact: true }).click()

    for (const key of ["Enter", "Space"]) {
      await input.fill("Folo mobile navigation fixture")
      await expect(
        dialog.getByRole("option", { name: /Folo mobile navigation fixture/ }),
      ).toBeVisible()
      await input.press("Tab")
      await expect(close).toBeFocused()
      await close.press(key)
      await expect(dialog).toHaveCount(0)
      await expect(page).toHaveURL(initialURL)
      await trigger.click()
    }

    await input.fill("Folo mobile navigation fixture")
    await expect(
      dialog.getByRole("option", { name: /Folo mobile navigation fixture/ }),
    ).toBeVisible()
    await input.press("Tab")
    await close.press("Tab")
    await expect(close).not.toBeFocused()
    await expect(input).not.toBeFocused()
    const searchType = dialog.getByTestId("local-search-type")
    await searchType.focus()
    await expect(searchType).toBeFocused()
    await searchType.press("Enter")
    await expect(page.getByRole("option", { name: "All", exact: true })).toBeVisible()
    await expect(page).toHaveURL(initialURL)
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(initialURL)

    await trigger.click()
    await input.fill("Folo mobile navigation fixture")
    await expect(
      dialog.getByRole("option", { name: /Folo mobile navigation fixture/ }),
    ).toBeVisible()
    await input.press("Enter")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId("entry-render")).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${MOBILE_DRAWER_E2E_ENTRY_ID}$`))
  })

  for (const searchType of ["Feed", "All"]) {
    test(`finds renamed subscriptions and categories in ${searchType} search without duplicate feeds`, async ({
      page,
    }) => {
      const customTitle = "Folo Quasar Journal"
      const category = "Nebular Astronomical Archive"
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
                  category,
                  title: customTitle,
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
      await page.setViewportSize({ width: 390, height: 844 })
      await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
      await ensureMobileDrawerClosed(page)
      await expect(page.locator(`[data-entry-id="${MOBILE_DRAWER_E2E_ENTRY_ID}"]`)).toBeVisible()
      await openMobileSubscriptionDrawerFromEntry(page)
      const drawer = page.locator("#mobile-subscription-drawer")
      const folder = drawer.getByRole("button", {
        name: `Toggle Folder Collapse: ${category}`,
        exact: true,
      })
      if ((await folder.getAttribute("aria-expanded")) !== "true") {
        await folder.click()
      }
      await expect(drawer.getByText(customTitle, { exact: true })).toBeVisible()
      await page.keyboard.press("Escape")
      await ensureMobileDrawerClosed(page)
      await page.getByTestId("mobile-local-search-trigger").click()
      const dialog = page.getByTestId("local-search-dialog")
      if (searchType === "All") {
        await dialog.getByTestId("local-search-type").click()
        await page.getByRole("option", { name: "All", exact: true }).click()
      }
      const input = dialog.getByTestId("local-search-input")
      const result = dialog.getByRole("option", { name: new RegExp(customTitle) })
      for (const keyword of [
        customTitle,
        category,
        "Folo E2E Feed",
        "https://example.com/folo-e2e.xml",
        "Folo",
      ]) {
        await input.fill("qzxvbnmqzxvbnmqzxvbnm")
        await expect(result).toHaveCount(0)
        await input.fill(keyword)
        await expect(result).toHaveCount(1)
        await expect(result).toBeVisible()
      }
      await result.click()
      await expect(dialog).toHaveCount(0)
      await expect(page).toHaveURL(/\/e2e-mobile-drawer-feed\/pending$/)
    })
  }
})
