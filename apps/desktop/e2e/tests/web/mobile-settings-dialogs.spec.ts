import { FeedViewType } from "@follow/constants"
import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerClosed,
  installMobileDrawerMockAuth,
  installMobileDrawerMockEntry,
  installMobileDrawerTestInitScripts,
  openMobileSubscriptionDrawerFromEntry,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()
const userId = "e2e-mobile-drawer-user"
const listId = "e2e-settings-dialog-list"
const listTitle = "Folo settings dialog fixture"

test.describe("responsive settings dialogs", () => {
  test.beforeEach(async ({ page }) => {
    await installMobileDrawerTestInitScripts(page)
    await installMobileDrawerMockAuth(page, env.apiURL)
    await installMobileDrawerMockEntry(page, env.apiURL)
    const apiHost = new URL(env.apiURL).host
    await page.route(
      (url) => url.host === apiHost && /\/subscriptions\/?$/.test(url.pathname),
      (route) => route.fulfill({ json: { code: 0, data: [] } }),
    )
    await page.route(
      (url) => url.host === apiHost && /\/lists\/list\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: [
              {
                id: listId,
                title: listTitle,
                ownerUserId: userId,
                description: null,
                image: null,
                view: FeedViewType.Articles,
                fee: 0,
                feedIds: [],
                subscriptionCount: 1,
              },
            ],
          },
        }),
    )
    await page.route(
      (url) => url.host === apiHost && /\/profiles\/batch\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: {
              [userId]: {
                id: userId,
                name: "E2E Mobile Drawer",
                handle: "e2e-mobile-drawer",
                image: null,
                bio: null,
                website: null,
                socialLinks: null,
              },
            },
          },
        }),
    )
  })

  for (const width of [320, 390, 1280]) {
    test(`keeps the list deletion confirmation reachable at ${width}px`, async ({ page }) => {
      const isMobile = width < 1024
      await page.setViewportSize({ width, height: 844 })
      await openWebApp(page, env)
      if (isMobile) {
        await ensureMobileDrawerClosed(page)
        await openMobileSubscriptionDrawerFromEntry(page)
      }
      await page.getByTestId("profile-menu-trigger").click()
      await page.getByTestId("profile-menu-preferences").click()
      await page.getByTestId("settings-tab-list").click()

      const row = page.locator("tr").filter({ hasText: listTitle })
      await expect(row).toBeVisible()
      await row.locator("button:has(.i-mgc-delete-2-cute-re)").click()
      const content = page.getByTestId("list-delete-confirmation")
      await expect(content).toBeVisible()
      const confirm = content.getByRole("button", { name: "Confirm", exact: true })
      await expect(confirm).toBeVisible()
      await expect
        .poll(() =>
          confirm.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const hit = document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            )
            return {
              insideViewport: bounds.x >= 0 && bounds.right <= window.innerWidth,
              reachable: hit !== null && element.contains(hit),
            }
          }),
        )
        .toEqual({ insideViewport: true, reachable: true })

      if (isMobile) {
        await expect
          .poll(async () => (await confirm.boundingBox())?.height ?? 0)
          .toBeGreaterThanOrEqual(44 - 0.01)
      } else {
        await expect.poll(async () => (await content.boundingBox())?.width ?? 0).toBeCloseTo(540, 1)
      }

      const deletion = page.waitForRequest(
        (request) =>
          request.method() === "DELETE" && /\/lists\/?$/.test(new URL(request.url()).pathname),
      )
      const bounds = (await confirm.boundingBox())!
      if (isMobile) {
        await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      } else {
        await confirm.click()
      }
      expect((await deletion).postDataJSON()).toEqual({ listId })
      await expect(content).toHaveCount(0)
      await expect(row).toHaveCount(0)
    })
  }

  test("closes the mobile drawer before Profile and prevents its keyboard trap from capturing the dialog", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openWebApp(page, env)
    await ensureMobileDrawerClosed(page)
    await openMobileSubscriptionDrawerFromEntry(page)
    await page.getByTestId("profile-menu-trigger").click()
    await page.getByRole("menuitem", { name: "Profile", exact: true }).click()

    const dialog = page.getByRole("dialog").last()
    const share = dialog.getByRole("button", { name: "Share", exact: true })
    await expect(share).toBeVisible()
    const drawer = page.locator("#mobile-subscription-drawer")
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(page.locator("main")).not.toHaveAttribute("inert", "")

    await share.focus()
    await page.keyboard.press("Tab")
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(drawer).toHaveAttribute("aria-hidden", "true")

    const opener = page.getByTestId("mobile-subscription-drawer-entry-trigger")
    await opener.focus()
    await page.keyboard.press("Tab")
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(false)
  })
})
