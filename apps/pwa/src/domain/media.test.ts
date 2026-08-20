import type { EntryMedia } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import {
  getAvatarUrl,
  getFeedIconUrl,
  getPreviewMedia,
  getReaderImageUrl,
  getSizedImageUrl,
  getTimelineImageUrl,
  IMAGE_PIXEL_SIZES,
} from "./media"

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

  test("routes avatars, feed icons, timeline, and reader images through sized proxy URLs", () => {
    const source = "https://cdn.example.com/original.jpg"
    expect(getFeedIconUrl(source)).toContain("https://img.folo.is?")
    expect(getFeedIconUrl(source)).toContain(`width=${IMAGE_PIXEL_SIZES.feedIcon}`)
    expect(getAvatarUrl(source)).toContain(`width=${IMAGE_PIXEL_SIZES.avatar}`)
    expect(getTimelineImageUrl(source, IMAGE_PIXEL_SIZES.socialGrid)).toContain(
      `width=${IMAGE_PIXEL_SIZES.socialGrid}`,
    )
    expect(getTimelineImageUrl(source, IMAGE_PIXEL_SIZES.pictures)).toContain(
      `width=${IMAGE_PIXEL_SIZES.pictures}`,
    )
    expect(getReaderImageUrl(source)).toContain(`width=${IMAGE_PIXEL_SIZES.reader}`)
    expect(getSizedImageUrl(source, 800)).toContain(encodeURIComponent(source))
  })

  test("does not wrap an image that is already on the proxy", () => {
    const proxied = "https://img.folo.is?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&width=400"
    expect(getSizedImageUrl(proxied, 960)).toBe(proxied)
  })
})
