import { FeedViewType } from "@follow/constants"
import type { Page, Route } from "@playwright/test"
import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import {
  installMobileDrawerMockAuth,
  openMobileSubscriptionDrawerFromEntry,
} from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()
const guestFeedIds = ["41147805276726272", "41147805268337669", "52325519371718656"]
const guestEntryIds = ["61147805272531991", "61147805272531992", "61147805272531993"]
const timelineRoute = "/timeline/articles/all/pending"
const accountPath =
  /\/(?:subscriptions|reads|unreads?|settings|wallets|inboxes|lists|collections|ai\/summary|entries\/read-histories)(?:\/|$)/

type EntryListRequest = {
  feedId?: string
  feedIdList?: string[]
  view?: number
  read?: boolean
  publishedAfter?: string
  isCollection?: boolean
}

const publicEntries = guestFeedIds.map((feedId, index) => ({
  read: false,
  view: FeedViewType.Articles,
  from: [],
  feeds: {
    id: feedId,
    type: "feed",
    title: `Guest source ${index + 1}`,
    url: `https://example.com/guest-source-${index + 1}.xml`,
    siteUrl: "https://example.com",
    description: null,
    image: null,
    ownerUserId: null,
    errorAt: null,
    errorMessage: null,
  },
  entries: {
    id: guestEntryIds[index],
    guid: guestEntryIds[index],
    title: `Guest timeline article ${index + 1}`,
    url: `https://example.com/guest-article-${index + 1}`,
    description: "Public article for guest browsing coverage.",
    author: "Folo E2E",
    authorUrl: null,
    authorAvatar: null,
    insertedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: new Date(Date.UTC(2026, 0, 1, 0, -index)).toISOString(),
    media: null,
    categories: null,
    attachments: null,
    extra: null,
    language: "en",
  },
}))

const installTimelineApi = async (page: Page, guest = true) => {
  const apiHost = new URL(env.apiURL).host
  const requests: EntryListRequest[] = []
  const accountRequests: string[] = []
  const mutations: string[] = []
  let sessionRequests = 0
  let rejectEntries = false

  const fulfillEntries = async (route: Route) => {
    const request = route.request()
    if (request.method() === "GET") {
      const id = new URL(request.url()).searchParams.get("id")
      const entry = publicEntries.find((item) => item.entries.id === id)
      await route.fulfill({
        json: {
          code: 0,
          data: entry && {
            feeds: entry.feeds,
            entries: { ...entry.entries, content: `<p>${entry.entries.title}</p>` },
          },
        },
      })
      return
    }

    const body = request.postDataJSON() as EntryListRequest
    requests.push(body)
    if (rejectEntries) {
      await route.fulfill({ status: 401, json: { code: 401, message: "Unauthorized" } })
      return
    }
    const data = body.publishedAfter
      ? []
      : publicEntries.filter(
          (item) =>
            (!body.feedId || item.feeds.id === body.feedId) &&
            (!body.feedIdList || body.feedIdList.includes(item.feeds.id)),
        )
    await route.fulfill({ json: { code: 0, data } })
  }

  if (guest) {
    await page.route(
      (url) => url.host === apiHost,
      async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (/\/better-auth\/get-session\/?$/.test(url.pathname)) {
          sessionRequests++
          await route.fulfill({ status: 200, contentType: "application/json", body: "null" })
          return
        }
        if (/\/better-auth\/get-providers\/?$/.test(url.pathname)) {
          await route.fulfill({
            json: {
              credential: { name: "Email", id: "credential", color: "", icon: "", icon64: "" },
            },
          })
          return
        }
        if (accountPath.test(url.pathname)) {
          accountRequests.push(`${request.method()} ${url.pathname}`)
          if (request.method() !== "GET") mutations.push(url.pathname)
          await route.fulfill({ status: 401, json: { code: 401, message: "Unauthorized" } })
          return
        }
        if (/\/feeds\/?$/.test(url.pathname)) {
          const item = publicEntries.find((entry) => entry.feeds.id === url.searchParams.get("id"))
          await route.fulfill({ json: { code: 0, data: { feed: item?.feeds, analytics: {} } } })
          return
        }
        await route.fulfill({ json: { code: 0, data: {} } })
      },
    )
  } else {
    await installMobileDrawerMockAuth(page, env.apiURL)
  }
  await page.route(
    (url) => url.host === apiHost && /\/entries\/?$/.test(url.pathname),
    fulfillEntries,
  )

  return {
    requests,
    accountRequests,
    mutations,
    sessionRequests: () => sessionRequests,
    rejectEntries: (value: boolean) => {
      rejectEntries = value
    },
  }
}

test.describe("public guest timeline", () => {
  test.use({ hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "follow:general",
        JSON.stringify({ language: "en", unreadOnly: true, scrollMarkUnread: true }),
      )
      localStorage.setItem("follow:ai-onboarding:dismissed:e2e-mobile-drawer-user", "1")
    })
  })

  test("browses the three public sources and reading navigation at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const api = await installTimelineApi(page)
    await openWebApp(page, env, "/")

    for (const id of guestEntryIds) {
      await expect(page.locator(`[data-entry-id="${id}"]`)).toBeVisible()
    }
    expect(api.sessionRequests()).toBeGreaterThan(0)
    expect(api.requests.length).toBeGreaterThan(0)
    for (const request of api.requests) {
      expect(request.feedIdList).toEqual(guestFeedIds)
      expect(request.read).not.toBe(false)
    }
    await expect(page.getByTestId("login-modal")).toBeHidden()

    await page.locator(`[data-entry-id="${guestEntryIds[0]}"]`).tap()
    await expect(page.getByTestId("entry-render")).toContainText(/Guest timeline article 1/i)
    await page
      .locator("button")
      .filter({ has: page.locator("i.i-mgc-right-small-sharp") })
      .tap()
    await expect(page).toHaveURL(new RegExp(`${guestEntryIds[1]}$`))
    await expect(page.getByTestId("entry-render")).toContainText(/Guest timeline article 2/i)
    await page
      .locator("button")
      .filter({ has: page.locator("i.i-mgc-left-small-sharp") })
      .tap()
    await expect(page).toHaveURL(new RegExp(`${guestEntryIds[0]}$`))
    await page.getByRole("button", { name: "Back", exact: true }).tap()
    await expect(page.getByTestId("entry-list-header")).toBeVisible()
    for (const id of guestEntryIds.slice(0, 2)) {
      await expect(page.locator(`[data-entry-id="${id}"]`)).toHaveAttribute("data-read", "true")
    }

    await openMobileSubscriptionDrawerFromEntry(page)
    const drawer = page.locator("#mobile-subscription-drawer")
    await expect(drawer.locator("button[data-feed-id]")).toHaveCount(3)
    await drawer.locator(`button[data-feed-id="${guestFeedIds[2]}"]`).tap()
    await expect(page).toHaveURL(new RegExp(`/articles/${guestFeedIds[2]}/pending$`))
    await expect(drawer).toHaveAttribute("aria-hidden", "true")
    await expect(page.locator(`[data-entry-id="${guestEntryIds[2]}"]`)).toBeVisible()
    await expect(page.locator(`[data-entry-id="${guestEntryIds[0]}"]`)).toHaveCount(0)
    expect(api.requests.some((request) => request.feedId === guestFeedIds[2])).toBe(true)
    expect(api.accountRequests).toEqual([])
  })

  test("keeps public 401 responses passive and guards starring without mutation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const api = await installTimelineApi(page)
    api.rejectEntries(true)
    const initialUnauthorized = page.waitForResponse(
      (response) =>
        /\/entries\/?$/.test(new URL(response.url()).pathname) && response.status() === 401,
    )
    await openWebApp(page, env, "/timeline/all/all/pending")
    await (await initialUnauthorized).finished()
    await expect(page.getByTestId("login-modal")).toBeHidden()

    api.rejectEntries(false)
    const refetch = page.getByRole("button", { name: "Refetch", exact: true })
    const initialRecovery = page.waitForResponse(
      (response) =>
        /\/entries\/?$/.test(new URL(response.url()).pathname) && response.status() === 200,
    )
    await refetch.click()
    await initialRecovery
    const firstEntry = page.locator(`[data-entry-id="${guestEntryIds[0]}"]`)
    await expect(firstEntry).toBeVisible()
    expect(api.requests.length).toBeGreaterThan(0)
    for (const request of api.requests) {
      expect(request.view).toBe(FeedViewType.All)
      expect(request.feedIdList).toEqual(guestFeedIds)
      expect(request.read).not.toBe(false)
    }
    await expect(page.getByTestId("login-modal")).toBeHidden()

    api.rejectEntries(true)
    const unauthorized = page.waitForResponse(
      (response) =>
        /\/entries\/?$/.test(new URL(response.url()).pathname) && response.status() === 401,
    )
    await refetch.click()
    await (await unauthorized).finished()
    await expect(page.getByTestId("login-modal")).toBeHidden()

    api.rejectEntries(false)
    const recovered = page.waitForResponse(
      (response) =>
        /\/entries\/?$/.test(new URL(response.url()).pathname) && response.status() === 200,
    )
    await refetch.click()
    await recovered
    await expect(firstEntry).toBeVisible()
    await expect(page.getByTestId("login-modal")).toBeHidden()
    await firstEntry.click()
    await expect(page.getByTestId("entry-render")).toBeVisible()
    await page.getByTestId("command-action-entry-star").click()
    await expect(page.getByTestId("login-modal")).toBeVisible()
    expect(api.mutations).toEqual([])
    expect(api.accountRequests).toEqual([])
  })

  test("keeps signed-in All requests independent of the guest source list", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const api = await installTimelineApi(page, false)
    await openWebApp(page, env, timelineRoute)
    await expect(page.getByTestId("profile-menu-trigger")).toBeVisible()
    await expect(page.locator(`[data-entry-id="${guestEntryIds[0]}"]`)).toBeVisible()
    expect(api.requests.length).toBeGreaterThan(0)
    for (const request of api.requests) {
      expect(request.feedIdList).toBeUndefined()
    }
    await expect(page.getByTestId("login-modal")).toBeHidden()
  })
})
