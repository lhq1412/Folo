import type { EntryMedia } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import { getPreviewMedia } from "./media"

describe("timeline media", () => {
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
