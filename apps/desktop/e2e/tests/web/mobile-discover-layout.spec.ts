import type { Locator } from "@playwright/test"
import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  ensureMobileDrawerClosed,
  installMobileDrawerMockAuth,
  installMobileDrawerTestInitScripts,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()
const feedId = "e2e-mobile-discover-feed"

const expectReachableControl = async (
  control: Locator,
  viewportWidth: number,
  minHeight?: number,
) => {
  await control.scrollIntoViewIfNeeded()
  const bounds = await control.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewportWidth)
  if (minHeight !== undefined) {
    expect(bounds!.height).toBeGreaterThanOrEqual(minHeight)
  }
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return hit !== null && element.contains(hit)
      }),
    )
    .toBe(true)
  await control.click({ trial: true })
}

test.describe("responsive Discover layout", () => {
  test.beforeEach(async ({ page }) => {
    await installMobileDrawerTestInitScripts(page)
    await installMobileDrawerMockAuth(page, env.apiURL)
    const apiHost = new URL(env.apiURL).host
    await page.route(
      (url) => url.host === apiHost && /\/discover\/?$/.test(url.pathname),
      (route) =>
        route.fulfill({
          json: {
            code: 0,
            data: [
              {
                feed: {
                  type: "feed",
                  id: feedId,
                  title: "Folo Discover layout fixture",
                  url: "https://example.com/folo-e2e.xml",
                  siteUrl: "https://example.com",
                  image: null,
                  description: null,
                },
                entries: [],
                analytics: { subscriptionCount: 12345, updatesPerWeek: 37, view: 0 },
              },
            ],
          },
        }),
    )
  })

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    test(`keeps Discover controls and result actions reachable at ${viewport.width}px`, async ({
      page,
    }) => {
      const isMobile = viewport.width < 1024
      const minButtonHeight = isMobile ? 44 : undefined
      await page.setViewportSize(viewport)
      await openWebApp(page, env, "/discover")
      if (isMobile) {
        await ensureMobileDrawerClosed(page)
      }

      const form = page.getByTestId("discover-form")
      const input = form.getByTestId("discover-form-input")
      await expect(input).toBeVisible()
      await expectReachableControl(input, viewport.width)
      if (isMobile) {
        const inputBounds = await input.boundingBox()
        expect(inputBounds!.width).toBeGreaterThanOrEqual(viewport.width * 0.7)
      }

      const tools = form.getByTestId("discover-form-tools").getByRole("button")
      await expect(tools).toHaveCount(4)
      const toolBounds = await tools.evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect()
          return { x: rect.x, y: rect.y }
        }),
      )
      expect(toolBounds[0]!.y).toBeCloseTo(toolBounds[1]!.y, 1)
      if (isMobile) {
        expect(toolBounds[2]!.y).toBeCloseTo(toolBounds[3]!.y, 1)
        expect(toolBounds[2]!.y).toBeGreaterThan(toolBounds[0]!.y)
        expect(toolBounds[0]!.x).toBeCloseTo(toolBounds[2]!.x, 1)
      } else {
        expect(toolBounds[2]!.y).toBeCloseTo(toolBounds[0]!.y, 1)
        expect(toolBounds[3]!.y).toBeCloseTo(toolBounds[0]!.y, 1)
      }
      for (let index = 0; index < 4; index++) {
        await expectReachableControl(tools.nth(index), viewport.width, minButtonHeight)
      }

      await input.fill("mobile layout")
      const submit = form.getByTestId("discover-form-submit")
      await expectReachableControl(submit, viewport.width, minButtonHeight)
      await submit.click()
      const card = page.locator(`[data-feed-id="${feedId}"]`)
      await expect(card).toBeVisible()
      const metadata = card.getByTestId("discover-feed-metadata")
      await expect(metadata).toContainText("12.3K")
      await expect(metadata).toContainText("37")
      const actions = card.getByTestId("discover-feed-actions")
      const layout = await card.evaluate((element) => {
        const metadataBounds = element
          .querySelector('[data-testid="discover-feed-metadata"]')!
          .getBoundingClientRect()
        const actionsBounds = element
          .querySelector('[data-testid="discover-feed-actions"]')!
          .getBoundingClientRect()
        return {
          hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
          metadataTop: metadataBounds.top,
          metadataBottom: metadataBounds.bottom,
          actionsTop: actionsBounds.top,
          actionsBottom: actionsBounds.bottom,
        }
      })
      expect(layout.hasHorizontalOverflow).toBe(false)
      if (isMobile) {
        expect(layout.actionsTop).toBeGreaterThanOrEqual(layout.metadataBottom)
      } else {
        expect(layout.actionsTop).toBeLessThan(layout.metadataBottom)
        expect(layout.actionsBottom).toBeGreaterThan(layout.metadataTop)
      }

      await expect(actions.getByRole("button")).toHaveCount(2)
      for (const name of ["Preview", "Follow"]) {
        await expectReachableControl(
          actions.getByRole("button", { name, exact: true }),
          viewport.width,
          minButtonHeight,
        )
      }
    })
  }
})
