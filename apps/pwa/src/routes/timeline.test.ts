// @vitest-environment jsdom

import type { EntryMedia } from "@follow-app/client-sdk"
import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import {
  getNextPageParam,
  getPreviewMedia,
  getTimelineView,
  sanitizeEntryContent,
  sanitizeSocialListContent,
} from "./timeline"

describe("timeline pagination", () => {
  test("continues from any non-empty page and stops on an empty page", () => {
    expect(getNextPageParam({ data: [] })).toBeUndefined()
    expect(
      getNextPageParam({ data: [{ entries: { publishedAt: "2026-08-10T12:00:00.000Z" } }] }),
    ).toBe("2026-08-10T12:00:00.000Z")
  })

  test("removes interactive and positioned content from feeds", () => {
    const sanitized = sanitizeEntryContent(
      '<form action="https://evil.example"><input><button>Continue</button></form><p style="position:fixed;inset:0">Safe</p>',
    )

    expect(sanitized).not.toMatch(/<(?:button|form|input)|style=/)
    expect(sanitized).toContain("<p>Safe</p>")
  })

  test("keeps social text without loading or nesting interactive media", () => {
    const sanitized = sanitizeSocialListContent(
      '<p style="position:fixed">Hello <a href="https://evil.example">world</a></p><img src="https://evil.example/large.jpg"><video src="https://evil.example/video.mp4"></video><button>Continue</button>',
    )

    expect(sanitized).not.toMatch(/<(?:a|button|img|video)|style=/)
    expect(sanitized).toContain("<p>Hello world</p>")
  })

  test("selects the supported timeline views", () => {
    expect(getTimelineView("social-media").view).toBe(FeedViewType.SocialMedia)
    expect(getTimelineView("pictures").view).toBe(FeedViewType.Pictures)
    expect(getTimelineView("unknown").view).toBe(FeedViewType.Articles)
  })

  test("deduplicates image previews and uses video poster images", () => {
    const media: EntryMedia[] = [
      { type: "photo", url: "https://example.com/photo.jpg" },
      { type: "photo", url: "https://example.com/photo.jpg" },
      {
        preview_image_url: "https://example.com/poster.jpg",
        type: "video",
        url: "https://example.com/video.mp4",
      },
      { type: "video", url: "https://example.com/no-poster.mp4" },
    ]

    expect(getPreviewMedia(media).map((item) => item.imageUrl)).toEqual([
      "https://example.com/photo.jpg",
      "https://example.com/poster.jpg",
    ])
  })
})
