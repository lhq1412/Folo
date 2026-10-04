import { FeedViewType } from "@follow/constants"
import type { Locator, Page } from "@playwright/test"
import { expect, test } from "@playwright/test"

import { openWebApp } from "../../support/app"
import { resolveDesktopE2EEnv } from "../../support/env"
import { installMobileDrawerMockAuth } from "../../support/mobile-drawer-fixture"

const env = resolveDesktopE2EEnv()
const feedIds = ["41147805276726272", "41147805268337669", "52325519371718656"]
const entryIds = Array.from({ length: 60 }, (_, index) =>
  String(61147805272532000n + BigInt(index)),
)
const timelineRoute = "/timeline/articles/all/pending"
const privatePath =
  /\/(?:subscriptions|reads|unreads?|settings|wallets|inboxes|lists|collections|ai[^/]*|entries\/read-histories)(?:\/|$)/

type EntriesRequest = {
  feedId?: string
  feedIdList?: string[]
  publishedAfter?: string
  read?: boolean
}

type ReadRequest = { entryIds: string[]; isInbox: boolean }

const createEntries = (guest: boolean) =>
  entryIds.map((id, index) => ({
    // Anonymous API read flags must not determine the visitor's local read state.
    read: guest || index === 0,
    view: FeedViewType.Articles,
    from: [],
    feeds: {
      id: feedIds[index % feedIds.length],
      type: "feed",
      title: `Timeline source ${(index % feedIds.length) + 1}`,
      url: `https://example.com/timeline-source-${index % feedIds.length}.xml`,
      siteUrl: "https://example.com",
      description: null,
      image: null,
      ownerUserId: null,
      errorAt: null,
      errorMessage: null,
    },
    entries: {
      id,
      guid: id,
      title: `Timeline read article ${index + 1}`,
      url: `https://example.com/timeline-read-${index + 1}`,
      description: "An article for checking read state at the visible timeline boundary.",
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

const installTimelineApi = async (page: Page, guest: boolean, pageSize = 60) => {
  const apiHost = new URL(env.apiURL).host
  const entries = createEntries(guest)
  const entriesRequests: EntriesRequest[] = []
  const accountRequests: string[] = []
  const readRequests: ReadRequest[] = []
  const serverReadIds = new Set(entries.filter((item) => item.read).map((item) => item.entries.id))
  let sessionRequests = 0
  let rejectEntries = false
  let failedEntriesRequests = 0
  let heldNextEntries: Promise<void> | null = null

  if (!guest) await installMobileDrawerMockAuth(page, env.apiURL)

  await page.route(
    (url) => url.host === apiHost,
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace(/\/$/, "")

      if (path.endsWith("/better-auth/get-session")) {
        sessionRequests++
        if (guest) {
          await route.fulfill({ status: 200, contentType: "application/json", body: "null" })
        } else {
          await route.fallback()
        }
        return
      }

      if (guest && privatePath.test(`${path}/`)) {
        accountRequests.push(`${request.method()} ${path}`)
        await route.fulfill({ status: 401, json: { code: 401, message: "Unauthorized" } })
        return
      }

      if (path.endsWith("/entries") && request.method() === "POST") {
        const body = request.postDataJSON() as EntriesRequest
        entriesRequests.push(body)
        const heldResponse = heldNextEntries
        heldNextEntries = null
        if (heldResponse) await heldResponse
        if (rejectEntries) {
          await route.fulfill({
            status: 503,
            json: { code: 503, message: "Temporary timeline failure" },
          })
          failedEntriesRequests++
          return
        }
        await route.fulfill({
          json: {
            code: 0,
            data: entries
              .filter(
                (item) =>
                  (!body.feedId || body.feedId === item.feeds.id) &&
                  (!body.feedIdList || body.feedIdList.includes(item.feeds.id)) &&
                  (!body.publishedAfter || item.entries.publishedAt < body.publishedAfter) &&
                  (body.read !== false || !serverReadIds.has(item.entries.id)),
              )
              .slice(0, pageSize)
              .map((item) => ({ ...item, read: serverReadIds.has(item.entries.id) })),
          },
        })
        return
      }

      if (path.endsWith("/entries/stream")) {
        await route.fulfill({ contentType: "application/x-ndjson", body: "" })
        return
      }

      if (!guest && path.endsWith("/reads")) {
        if (request.method() === "POST") {
          const body = request.postDataJSON() as ReadRequest
          readRequests.push(body)
          for (const id of body.entryIds) serverReadIds.add(id)
          await route.fulfill({ json: { code: 0, data: null } })
        } else {
          const unreadCounts = Object.fromEntries(feedIds.map((id) => [id, 0]))
          for (const item of entries) {
            if (!serverReadIds.has(item.entries.id)) unreadCounts[item.feeds.id]++
          }
          await route.fulfill({
            json: { code: 0, data: unreadCounts },
          })
        }
        return
      }

      if (guest) {
        await route.fulfill({ json: { code: 0, data: {} } })
      } else {
        await route.fallback()
      }
    },
  )

  return {
    entriesRequests,
    accountRequests,
    readRequests,
    sessionRequests: () => sessionRequests,
    rejectEntries: (value: boolean) => {
      rejectEntries = value
    },
    failedEntriesRequests: () => failedEntriesRequests,
    holdNextEntries: () => {
      let release!: () => void
      heldNextEntries = new Promise<void>((resolve) => {
        release = resolve
      })
      return release
    },
  }
}

const installSettings = async (page: Page, scrollMarkUnread: boolean, unreadOnly = false) => {
  await page.addInitScript(
    ({ scrollMarkUnread, unreadOnly }) => {
      localStorage.setItem(
        "follow:general",
        JSON.stringify({
          language: "en",
          scrollMarkUnread,
          renderMarkUnread: false,
          hoverMarkUnread: false,
          unreadOnly,
          groupByDate: false,
          dimRead: false,
        }),
      )
      localStorage.setItem("follow:ai-onboarding:dismissed:e2e-mobile-drawer-user", "1")
    },
    { scrollMarkUnread, unreadOnly },
  )
}

const entryRow = (page: Page, index: number) => page.locator(`[data-entry-id="${entryIds[index]}"]`)
const scrollViewport = (row: Locator) =>
  row
    .page()
    .locator("[data-radix-scroll-area-viewport]")
    .filter({
      has: row.page().locator("[data-entry-id]"),
    })

const waitForTimeline = async (page: Page, firstIndex = 0) => {
  await expect(entryRow(page, firstIndex)).toBeVisible({ timeout: 60_000 })
  await expect(entryRow(page, firstIndex + 1)).toBeVisible()
  await expect(page.getByTestId("entry-list-header")).toBeVisible()
  // The product pauses scroll marking for one second after a fetch completes.
  await page.waitForTimeout(1200)
}

const scrollRowPastTop = async (page: Page, row: Locator, remainingHeight: number) => {
  const viewport = scrollViewport(row)
  const viewportBox = await viewport.boundingBox()
  const rowBox = await row.boundingBox()
  expect(viewportBox).not.toBeNull()
  expect(rowBox).not.toBeNull()
  if (!viewportBox || !rowBox) throw new Error("Timeline row or viewport has no bounds")
  const previousScrollTop = await viewport.evaluate((element) => element.scrollTop)
  const delta = rowBox.y + rowBox.height - viewportBox.y - remainingHeight
  await page.mouse.move(
    viewportBox.x + viewportBox.width / 2,
    viewportBox.y + viewportBox.height / 2,
  )
  await page.mouse.wheel(0, delta)
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeCloseTo(previousScrollTop + delta, 0)
  const geometry = await row.evaluate((element) => {
    const viewport = element.closest<HTMLElement>("[data-radix-scroll-area-viewport]")
    const virtualRow = element.closest<HTMLElement>("[data-index]")
    if (!viewport || !virtualRow) throw new Error("Timeline scroll ancestors are missing")
    return {
      row: element.getBoundingClientRect().toJSON(),
      virtualRow: virtualRow.getBoundingClientRect().toJSON(),
      viewport: viewport.getBoundingClientRect().toJSON(),
      scrollTop: viewport.scrollTop,
    }
  })
  await test.info().attach("timeline-scroll-boundary", {
    body: JSON.stringify(geometry),
    contentType: "application/json",
  })
  if (remainingHeight < 0) {
    expect(geometry.row.bottom).toBeLessThanOrEqual(geometry.viewport.top)
  }
}

const returnToTop = async (page: Page, viewport: Locator) => {
  const bounds = await viewport.boundingBox()
  if (!bounds) throw new Error("Timeline viewport has no bounds")
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.wheel(0, -10_000)
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0)
}

const titleColor = (row: Locator) =>
  row.locator("[data-entry-title]").evaluate((element) => getComputedStyle(element).color)

const hasUnreadMarker = (row: Locator) =>
  row
    .locator("a > div")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element, "::before")
      return (
        style.content !== "none" && style.content !== "normal" && Number.parseFloat(style.width) > 0
      )
    })

test.describe("timeline read state", () => {
  for (const view of ["Articles", "All"]) {
    test(`keeps newly read guest ${view} rows until a successful refresh at 390px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await installSettings(page, true)
      const api = await installTimelineApi(page, true)
      await openWebApp(page, env, `/timeline/${view.toLowerCase()}/all/pending`)
      await waitForTimeline(page)
      const first = entryRow(page, 0)
      const second = entryRow(page, 1)
      const viewport = scrollViewport(first)

      await expect(first).toHaveAttribute("data-read", "false")
      await expect(second).toHaveAttribute("data-read", "false")
      expect(await hasUnreadMarker(first)).toBe(true)
      const unreadColor = await titleColor(first)

      const rowHeight = (await first.boundingBox())?.height
      expect(rowHeight).toBeGreaterThan(0)
      await scrollRowPastTop(page, first, (rowHeight ?? 0) / 2)
      await page.waitForTimeout(350)
      await expect(first).toHaveAttribute("data-read", "false")

      await scrollRowPastTop(page, first, -1)
      await expect(first).toHaveAttribute("data-read", "true")
      await expect(second).toHaveAttribute("data-read", "false")
      await returnToTop(page, viewport)
      await expect(first).toBeVisible()
      expect(await hasUnreadMarker(first)).toBe(false)
      expect(await hasUnreadMarker(second)).toBe(true)
      expect(await titleColor(first)).not.toBe(unreadColor)
      expect(await titleColor(second)).toBe(unreadColor)

      const requestCount = api.entriesRequests.length
      const releaseRefresh = api.holdNextEntries()
      try {
        await page.getByRole("button", { name: "Refetch", exact: true }).click()
        await expect.poll(() => api.entriesRequests.length).toBeGreaterThan(requestCount)
        await expect(first).toBeVisible()
        await expect(first).toHaveAttribute("data-read", "true")
      } finally {
        releaseRefresh()
      }
      await expect(first).toHaveCount(0)
      await waitForTimeline(page, 1)
      await expect(second).toHaveAttribute("data-read", "false")
      expect(await hasUnreadMarker(second)).toBe(true)
      expect(api.sessionRequests()).toBeGreaterThan(0)
      expect(api.entriesRequests.every((request) => request.read !== false)).toBe(true)
      expect(api.accountRequests).toEqual([])
      await expect(page.getByTestId("login-modal")).toBeHidden()
    })
  }

  test("preserves server read states and keeps Show All rows after refresh at 1280px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await installSettings(page, true)
    const api = await installTimelineApi(page, false)
    await openWebApp(page, env, timelineRoute)
    await waitForTimeline(page)
    const alreadyRead = entryRow(page, 0)
    const unread = entryRow(page, 1)
    const nextUnread = entryRow(page, 2)
    const viewport = scrollViewport(alreadyRead)

    await expect(alreadyRead).toHaveAttribute("data-read", "true")
    await expect(unread).toHaveAttribute("data-read", "false")
    expect(await hasUnreadMarker(alreadyRead)).toBe(false)
    expect(await hasUnreadMarker(unread)).toBe(true)
    expect(await titleColor(alreadyRead)).not.toBe(await titleColor(unread))
    expect(api.readRequests).toEqual([])

    await scrollRowPastTop(page, unread, -1)
    await expect(unread).toHaveAttribute("data-read", "true")
    await expect
      .poll(() => api.readRequests.flatMap((request) => request.entryIds))
      .toEqual([entryIds[1]])
    expect(api.readRequests.every((request) => request.isInbox === false)).toBe(true)
    await expect(nextUnread).toHaveAttribute("data-read", "false")
    await returnToTop(page, viewport)
    await expect(unread).toBeVisible()
    expect(await hasUnreadMarker(unread)).toBe(false)
    expect(await hasUnreadMarker(nextUnread)).toBe(true)
    expect(await titleColor(unread)).toBe(await titleColor(alreadyRead))

    const requestCount = api.entriesRequests.length
    await page.getByRole("button", { name: "Refetch", exact: true }).click()
    await expect.poll(() => api.entriesRequests.length).toBeGreaterThan(requestCount)
    await waitForTimeline(page)
    await expect(unread).toHaveAttribute("data-read", "true")
    await expect(alreadyRead).toBeVisible()
    expect(api.entriesRequests.every((request) => request.read !== false)).toBe(true)
  })

  for (const guest of [true, false]) {
    test(`keeps read ${guest ? "guest" : "unread-only authenticated"} rows through pagination and failed refresh`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: guest ? 390 : 1280, height: 844 })
      await installSettings(page, true, !guest)
      const api = await installTimelineApi(page, guest, 40)
      await openWebApp(page, env, timelineRoute)
      const firstIndex = guest ? 0 : 1
      await waitForTimeline(page, firstIndex)
      if (!guest) await expect(entryRow(page, 0)).toHaveCount(0)
      const first = entryRow(page, firstIndex)
      const viewport = scrollViewport(first)
      await expect(first).toHaveAttribute("data-read", "false")
      await scrollRowPastTop(page, first, -1)
      await expect(first).toHaveAttribute("data-read", "true")
      await returnToTop(page, viewport)
      await expect(first).toBeVisible()
      if (!guest) {
        await expect
          .poll(() => api.readRequests.flatMap((request) => request.entryIds))
          .toContain(entryIds[firstIndex])
      }

      const bounds = await viewport.boundingBox()
      if (!bounds) throw new Error("Timeline viewport has no bounds")
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.wheel(0, 10_000)
      await expect
        .poll(() => api.entriesRequests.some((request) => request.publishedAfter))
        .toBe(true)
      await expect(entryRow(page, firstIndex + 40)).toBeVisible()
      await returnToTop(page, viewport)
      await expect(first).toBeVisible()
      await expect(first).toHaveAttribute("data-read", "true")
      expect(await hasUnreadMarker(first)).toBe(false)

      api.rejectEntries(true)
      const requestCount = api.entriesRequests.length
      const releaseRefresh = api.holdNextEntries()
      try {
        await page.getByRole("button", { name: "Refetch", exact: true }).click()
        await expect.poll(() => api.entriesRequests.length).toBeGreaterThan(requestCount)
        await expect(first).toBeVisible()
        await expect(first).toHaveAttribute("data-read", "true")
      } finally {
        releaseRefresh()
      }
      await expect.poll(api.failedEntriesRequests).toBe(4)
      await expect(
        page.getByRole("button", { name: "Refetch", exact: true }).locator("i"),
      ).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)")
      await expect(first).toBeVisible()
      await expect(first).toHaveAttribute("data-read", "true")

      api.rejectEntries(false)
      await page.getByRole("button", { name: "Refetch", exact: true }).click()
      await expect(first).toHaveCount(0)
      await expect(page.locator('[data-entry-id][data-read="false"]').first()).toBeVisible()
      if (guest) {
        expect(api.accountRequests).toEqual([])
        await expect(page.getByTestId("login-modal")).toBeHidden()
      } else {
        expect(api.entriesRequests.every((request) => request.read === false)).toBe(true)
      }
    })
  }

  test("marks guest rows scrolled out immediately after a refresh once the grace period ends", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installSettings(page, true)
    const api = await installTimelineApi(page, true)
    await openWebApp(page, env, timelineRoute)
    await waitForTimeline(page)
    const first = entryRow(page, 0)
    await expect(first).toHaveAttribute("data-read", "false")

    const refreshed = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/entries\/?$/.test(new URL(response.url()).pathname),
    )
    await page.getByRole("button", { name: "Refetch", exact: true }).click()
    await (await refreshed).finished()
    await expect(first).toBeVisible()
    // Deliberately scroll during the post-refresh pause without waiting for another wheel event.
    await scrollRowPastTop(page, first, -1)
    await expect(first).toHaveAttribute("data-read", "true")
    await expect(entryRow(page, 1)).toHaveAttribute("data-read", "false")
    expect(api.accountRequests).toEqual([])
    await expect(page.getByTestId("login-modal")).toBeHidden()
  })

  for (const guest of [true, false]) {
    test(`does not mark rows when scroll marking is disabled for ${guest ? "guests" : "signed-in readers"}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: guest ? 390 : 1280, height: 844 })
      await installSettings(page, false)
      const api = await installTimelineApi(page, guest)
      await openWebApp(page, env, timelineRoute)
      await waitForTimeline(page)
      const unread = entryRow(page, guest ? 0 : 1)
      const viewport = scrollViewport(unread)
      await expect(unread).toHaveAttribute("data-read", "false")
      await scrollRowPastTop(page, unread, -1)
      await page.waitForTimeout(350)
      await returnToTop(page, viewport)
      await expect(unread).toHaveAttribute("data-read", "false")
      expect(await hasUnreadMarker(unread)).toBe(true)
      expect(api.readRequests).toEqual([])
      if (guest) {
        expect(api.accountRequests).toEqual([])
        await expect(page.getByTestId("login-modal")).toBeHidden()
      }
    })
  }
})
