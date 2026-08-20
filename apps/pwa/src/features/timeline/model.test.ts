import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import { getNextPageParam, getTimelineHref, getTimelineView } from "./model"

describe("timeline model", () => {
  test("continues from any non-empty page and stops on an empty page", () => {
    expect(getNextPageParam({ data: [] })).toBeUndefined()
    expect(
      getNextPageParam({ data: [{ entries: { publishedAt: "2026-08-10T12:00:00.000Z" } }] }),
    ).toBe("2026-08-10T12:00:00.000Z")
  })

  test("selects the supported timeline views", () => {
    expect(getTimelineView("social-media").view).toBe(FeedViewType.SocialMedia)
    expect(getTimelineView("pictures").view).toBe(FeedViewType.Pictures)
    expect(getTimelineView("unknown").view).toBe(FeedViewType.Articles)
  })

  test("keeps the articles timeline on the root path", () => {
    expect(getTimelineHref(getTimelineView("articles"))).toBe("/")
    expect(getTimelineHref(getTimelineView("social-media"))).toBe("/?view=social-media")
  })
})
