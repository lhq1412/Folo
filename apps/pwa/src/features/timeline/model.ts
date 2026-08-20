import { FeedViewType } from "@follow-app/client-sdk"

import type { EntryListItem } from "../../domain/entry"

export const PAGE_SIZE = 20
/** Newest pages kept in memory (~120 items). Older pages drop on fetch-next. */
export const MAX_RETAINED_PAGES = 6
export const UNREAD_ONLY_STORAGE_KEY = "follow:pwa:unreadOnly"
export const TIMELINE_STALE_TIME_MS = 5 * 60 * 1000
export const TIMELINE_GC_TIME_MS = 30 * 60 * 1000

type TimelineViewBase = {
  description: string
  icon: string
  label: string
  slug: string
  title: string
}

export type FeedTimelineView = TimelineViewBase & {
  kind: "feed"
  view: FeedViewType
}

export type SavedTimelineView = TimelineViewBase & {
  kind: "saved"
  slug: "saved"
}

export type TimelineView = FeedTimelineView | SavedTimelineView

export const TIMELINE_VIEWS: readonly TimelineView[] = [
  {
    description: "Your latest articles",
    icon: "i-mgc-paper-cute-re",
    kind: "feed",
    label: "Articles",
    slug: "articles",
    title: "Today",
    view: FeedViewType.Articles,
  },
  {
    description: "Posts from people and communities",
    icon: "i-mgc-thought-cute-re",
    kind: "feed",
    label: "Social",
    slug: "social-media",
    title: "Social Media",
    view: FeedViewType.SocialMedia,
  },
  {
    description: "Photos from your feeds",
    icon: "i-mgc-pic-cute-re",
    kind: "feed",
    label: "Pictures",
    slug: "pictures",
    title: "Pictures",
    view: FeedViewType.Pictures,
  },
  {
    description: "Entries you saved for later",
    icon: "i-mgc-star-cute-re",
    kind: "saved",
    label: "Saved",
    slug: "saved",
    title: "Saved",
  },
]

export const getTimelineView = (slug: string | null): TimelineView =>
  TIMELINE_VIEWS.find((item) => item.slug === slug) ?? TIMELINE_VIEWS[0]!

export const getTimelineHref = (view: TimelineView) =>
  view.slug === "articles" ? "/" : `/?view=${view.slug}`

export const getEntryHref = (entryId: string, view: TimelineView) =>
  view.slug === "articles" ? `/entries/${entryId}` : `/entries/${entryId}?view=${view.slug}`

export const isPicturesTimeline = (view: TimelineView) =>
  view.kind === "feed" && view.view === FeedViewType.Pictures

export const timelineCardLayout = (item: EntryListItem, view: TimelineView) => {
  const feedView = view.kind === "feed" ? view.view : item.view
  if (feedView === FeedViewType.SocialMedia) return "social" as const
  if (feedView === FeedViewType.Pictures) return "pictures" as const
  return "articles" as const
}

type TimelineCursorPage = {
  data: Array<{
    collections?: { createdAt?: Date | string }
    entries: { publishedAt: string }
  }>
}

export const getNextPageParam = (page: TimelineCursorPage) => page.data.at(-1)?.entries.publishedAt

export const getSavedNextPageParam = (page: TimelineCursorPage) => {
  const last = page.data.at(-1)
  const createdAt = last?.collections?.createdAt
  if (createdAt instanceof Date) return createdAt.toISOString()
  return createdAt ?? last?.entries.publishedAt
}
