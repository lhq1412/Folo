import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import {
  getEntryHref,
  getNextPageParam,
  getSavedNextPageParam,
  getTimelineHref,
  getTimelineView,
  timelineCardLayout,
} from "./model"

describe("timeline model", () => {
  test("continues from any non-empty page and stops on an empty page", () => {
    expect(getNextPageParam({ data: [] })).toBeUndefined()
    expect(
      getNextPageParam({ data: [{ entries: { publishedAt: "2026-08-10T12:00:00.000Z" } }] }),
    ).toBe("2026-08-10T12:00:00.000Z")
  })

  test("paginates saved entries from collection createdAt", () => {
    expect(
      getSavedNextPageParam({
        data: [
          {
            collections: { createdAt: "2026-08-11T08:00:00.000Z" },
            entries: { publishedAt: "2026-08-01T12:00:00.000Z" },
          },
        ],
      }),
    ).toBe("2026-08-11T08:00:00.000Z")
  })

  test("selects the supported timeline views", () => {
    expect(getTimelineView("social-media").kind).toBe("feed")
    expect(getTimelineView("social-media")).toMatchObject({ view: FeedViewType.SocialMedia })
    expect(getTimelineView("pictures")).toMatchObject({ view: FeedViewType.Pictures })
    expect(getTimelineView("saved")).toMatchObject({ kind: "saved", slug: "saved" })
    expect(getTimelineView("unknown")).toMatchObject({ view: FeedViewType.Articles })
  })

  test("keeps the articles timeline on the root path", () => {
    expect(getTimelineHref(getTimelineView("articles"))).toBe("/")
    expect(getTimelineHref(getTimelineView("social-media"))).toBe("/?view=social-media")
    expect(getTimelineHref(getTimelineView("saved"))).toBe("/?view=saved")
    expect(getEntryHref("entry-1", getTimelineView("saved"))).toBe("/entries/entry-1?view=saved")
  })

  test("renders saved cards from the entry's original view", () => {
    const saved = getTimelineView("saved")
    expect(
      timelineCardLayout(
        { view: FeedViewType.SocialMedia } as unknown as Parameters<typeof timelineCardLayout>[0],
        saved,
      ),
    ).toBe("social")
    expect(
      timelineCardLayout(
        { view: FeedViewType.Pictures } as unknown as Parameters<typeof timelineCardLayout>[0],
        saved,
      ),
    ).toBe("pictures")
  })
})
