import { FeedViewType } from "@follow-app/client-sdk"

export const PAGE_SIZE = 20
export const UNREAD_ONLY_STORAGE_KEY = "follow:pwa:unreadOnly"

export const TIMELINE_VIEWS = [
  {
    description: "Your latest articles",
    icon: "i-mgc-paper-cute-re",
    label: "Articles",
    slug: "articles",
    title: "Today",
    view: FeedViewType.Articles,
  },
  {
    description: "Posts from people and communities",
    icon: "i-mgc-thought-cute-re",
    label: "Social",
    slug: "social-media",
    title: "Social Media",
    view: FeedViewType.SocialMedia,
  },
  {
    description: "Photos from your feeds",
    icon: "i-mgc-pic-cute-re",
    label: "Pictures",
    slug: "pictures",
    title: "Pictures",
    view: FeedViewType.Pictures,
  },
] as const

export type TimelineView = (typeof TIMELINE_VIEWS)[number]

export const getTimelineView = (slug: string | null): TimelineView =>
  TIMELINE_VIEWS.find((item) => item.slug === slug) ?? TIMELINE_VIEWS[0]

export const getTimelineHref = (view: TimelineView) =>
  view.view === FeedViewType.Articles ? "/" : `/?view=${view.slug}`

export const getEntryHref = (entryId: string, view: TimelineView) =>
  view.view === FeedViewType.Articles
    ? `/entries/${entryId}`
    : `/entries/${entryId}?view=${view.slug}`

export const getNextPageParam = (page: { data: Array<{ entries: { publishedAt: string } }> }) =>
  page.data.at(-1)?.entries.publishedAt
