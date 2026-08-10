import { mkdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { FeedViewType } from "@follow/constants"
import type { Page, Route } from "@playwright/test"
import { expect } from "@playwright/test"
import { dirname, join } from "pathe"

import type { TestAccount } from "./account"
import { injectRecaptchaToken, openWebApp, waitForAuthenticated } from "./app"
import { bootstrapAuthenticatedWebSession } from "./auth-bootstrap"
import type { DesktopE2EEnv } from "./env"

const MOBILE_DRAWER_E2E_USER_ID = "e2e-mobile-drawer-user"
const MOBILE_LAYOUT_INIT_KEY = "follow:mobile-layout-initialized"
const MOBILE_DRAWER_APP_TIP_DISMISS_KEY = `follow:ai-onboarding:dismissed:${MOBILE_DRAWER_E2E_USER_ID}`
const MOBILE_DRAWER_E2E_FEED_ID = "e2e-mobile-drawer-feed"
export const MOBILE_DRAWER_E2E_ENTRY_ID = "41147805272531997"

const mockFeed = {
  type: "feed",
  id: MOBILE_DRAWER_E2E_FEED_ID,
  title: "Folo E2E Feed",
  url: "https://example.com/folo-e2e.xml",
  image: null,
  description: null,
  ownerUserId: null,
  errorAt: null,
  errorMessage: null,
  siteUrl: "https://example.com",
}

const mockEntry = {
  id: MOBILE_DRAWER_E2E_ENTRY_ID,
  title: "Folo mobile navigation fixture",
  url: "https://example.com/folo-e2e-entry",
  description: "Stable entry for mobile navigation E2E coverage.",
  guid: MOBILE_DRAWER_E2E_ENTRY_ID,
  author: "Folo E2E",
  authorUrl: null,
  authorAvatar: null,
  insertedAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
  media: null,
  categories: null,
  attachments: null,
  extra: null,
  language: "en",
}

const mockSessionUser = {
  id: MOBILE_DRAWER_E2E_USER_ID,
  email: "e2e-mobile-drawer@follow.test",
  name: "E2E Mobile Drawer",
  emailVerified: true,
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const mockSessionResponse = {
  user: mockSessionUser,
  session: {
    id: "e2e-mobile-drawer-session",
    userId: MOBILE_DRAWER_E2E_USER_ID,
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
}

export const MOBILE_DRAWER_AUTH_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.auth/mobile-drawer.json",
)

export const MOBILE_DRAWER_TIMELINE_ROUTE = "/timeline/articles/all/pending"

export const resolveMobileDrawerTestAccount = (): TestAccount | null => {
  const email = process.env.FOLO_E2E_ACCOUNT_EMAIL
  const password = process.env.FOLO_E2E_PASSWORD

  if (!email && !password) {
    return null
  }

  if (!email || !password) {
    throw new Error(
      "FOLO_E2E_ACCOUNT_EMAIL and FOLO_E2E_PASSWORD must be configured together for fixed-account mobile drawer E2E.",
    )
  }

  return {
    email,
    password,
  }
}

const fulfillMockSession = async (route: Route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(mockSessionResponse),
  })
}

const fulfillMockApi = async (route: Route) => {
  if (route.request().url().includes("/better-auth/")) {
    await fulfillMockSession(route)
    return
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 0, data: {} }),
  })
}

const fulfillMockEntries = async (route: Route) => {
  const request = route.request()
  const requestBody =
    request.method() === "POST" ? (request.postDataJSON() as { publishedAfter?: string }) : null
  const data =
    request.method() === "GET"
      ? {
          feeds: mockFeed,
          entries: { ...mockEntry, content: "<p>Folo mobile navigation fixture.</p>" },
        }
      : requestBody?.publishedAfter
        ? []
        : [
            {
              read: false,
              view: FeedViewType.Articles,
              from: [],
              feeds: mockFeed,
              entries: mockEntry,
            },
          ]

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 0, data }),
  })
}

export const installMobileDrawerMockAuth = async (page: Page, apiURL: string) => {
  const apiHost = new URL(apiURL).host

  await page.route("**/better-auth/get-session**", fulfillMockSession)
  await page.route("**/better-auth/sign-in/**", fulfillMockSession)
  await page.route("**/better-auth/sign-up/**", fulfillMockSession)
  await page.route(`**://${apiHost}/**`, fulfillMockApi)
}

export const installMobileDrawerMockEntry = async (page: Page, apiURL: string) => {
  const apiHost = new URL(apiURL).host
  await page.route(
    (url) => url.host === apiHost && /\/entries\/?$/.test(url.pathname),
    fulfillMockEntries,
  )
}

export const installMobileDrawerTestInitScripts = async (page: Page) => {
  await page.addInitScript(
    ({ appTipDismissKey, layoutInitKey }) => {
      localStorage.removeItem(layoutInitKey)
      localStorage.setItem(appTipDismissKey, "1")
    },
    {
      appTipDismissKey: MOBILE_DRAWER_APP_TIP_DISMISS_KEY,
      layoutInitKey: MOBILE_LAYOUT_INIT_KEY,
    },
  )
}

export const prepareMobileDrawerAuthenticatedPage = async (page: Page, env: DesktopE2EEnv) => {
  const fixedAccount = resolveMobileDrawerTestAccount()

  if (fixedAccount) {
    await bootstrapAuthenticatedWebSession(page, env, fixedAccount)
    await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
    return
  }

  await installMobileDrawerTestInitScripts(page)
  await installMobileDrawerMockAuth(page, env.apiURL)
  await injectRecaptchaToken(page, env)
  await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
  await waitForAuthenticated(page)
}

export const ensureMobileDrawerClosed = async (page: Page) => {
  const drawer = page.locator("#mobile-subscription-drawer")
  const isOpen = await drawer.getAttribute("aria-modal").catch(() => null)

  if (isOpen === "true") {
    await page.keyboard.press("Escape")
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
  }
}

export const ensureMobileDrawerTimelineReady = async (page: Page, env: DesktopE2EEnv) => {
  if (!resolveMobileDrawerTestAccount()) {
    await installMobileDrawerTestInitScripts(page)
    await installMobileDrawerMockAuth(page, env.apiURL)
  }

  await openWebApp(page, env, MOBILE_DRAWER_TIMELINE_ROUTE)
  await ensureMobileDrawerClosed(page)

  await expect(
    page.locator('[data-testid="mobile-subscription-drawer-entry-trigger"]:visible'),
  ).toBeVisible({ timeout: 30_000 })
}

export const openMobileSubscriptionDrawerFromEntry = async (
  page: Page,
  options: { method?: "click" | "enter" } = {},
) => {
  const method = options.method ?? "click"
  const entryTrigger = page.locator(
    '[data-testid="mobile-subscription-drawer-entry-trigger"]:visible',
  )
  const drawer = page.locator("#mobile-subscription-drawer")

  await expect(entryTrigger).toBeVisible({ timeout: 30_000 })

  if (method === "enter") {
    await entryTrigger.focus()
    await entryTrigger.press("Enter")
  } else {
    await entryTrigger.click()
  }

  await expect(drawer).toHaveAttribute("aria-modal", "true", { timeout: 15_000 })
}

export const saveMobileDrawerAuthState = async (page: Page) => {
  await mkdir(dirname(MOBILE_DRAWER_AUTH_FILE), { recursive: true })
  await page.context().storageState({ path: MOBILE_DRAWER_AUTH_FILE })
}
