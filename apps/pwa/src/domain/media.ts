import { getImageProxyUrl, IMAGE_PROXY_URL } from "@follow/utils/img-proxy"
import type { EntryMedia } from "@follow-app/client-sdk"

export type PreviewMedia = { imageUrl: string; media: EntryMedia }

/** Presentation-sized proxy widths. Values are CSS size × ~2–3x DPR, capped. */
export const IMAGE_PIXEL_SIZES = {
  feedIcon: 64,
  avatar: 96,
  socialGrid: 400,
  socialGridWide: 800,
  pictures: 600,
  reader: 960,
} as const

const FOLLOW_IMAGE_PROXY = "https://img.follow.is"

export const getPreviewMedia = (media: EntryMedia[] | null | undefined): PreviewMedia[] => {
  const previews = new Map<string, EntryMedia>()

  for (const item of media ?? []) {
    const imageUrl = item.type === "photo" ? item.url : item.preview_image_url
    if (imageUrl && !previews.has(imageUrl)) previews.set(imageUrl, item)
  }

  return Array.from(previews, ([imageUrl, item]) => ({ imageUrl, media: item }))
}

const isAlreadyProxied = (url: string) =>
  url.startsWith(IMAGE_PROXY_URL) || url.startsWith(FOLLOW_IMAGE_PROXY)

export const getSizedImageUrl = (url: string, width: number, height?: number) => {
  if (!url || isAlreadyProxied(url)) return url
  return getImageProxyUrl({ canUseProxy: true, height, url, width })
}

export const getTimelineImageUrl = (url: string, width: number, height?: number) =>
  getSizedImageUrl(url, width, height)

export const getFeedIconUrl = (url: string) => getSizedImageUrl(url, IMAGE_PIXEL_SIZES.feedIcon)

export const getAvatarUrl = (url: string) => getSizedImageUrl(url, IMAGE_PIXEL_SIZES.avatar)

export const getReaderImageUrl = (url: string) => getSizedImageUrl(url, IMAGE_PIXEL_SIZES.reader)
