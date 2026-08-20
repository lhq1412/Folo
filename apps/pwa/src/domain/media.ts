import { getImageProxyUrl } from "@follow/utils/img-proxy"
import type { EntryMedia } from "@follow-app/client-sdk"

export type PreviewMedia = { imageUrl: string; media: EntryMedia }

export const getPreviewMedia = (media: EntryMedia[] | null | undefined): PreviewMedia[] => {
  const previews = new Map<string, EntryMedia>()

  for (const item of media ?? []) {
    const imageUrl = item.type === "photo" ? item.url : item.preview_image_url
    if (imageUrl && !previews.has(imageUrl)) previews.set(imageUrl, item)
  }

  return Array.from(previews, ([imageUrl, item]) => ({ imageUrl, media: item }))
}

export const getTimelineImageUrl = (url: string, width: number, height?: number) =>
  getImageProxyUrl({ canUseProxy: true, height, url, width })
