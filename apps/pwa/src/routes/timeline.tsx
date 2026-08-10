/* eslint-disable react-dom/no-dangerously-set-innerhtml -- Feed HTML is sanitized with DOMPurify at the render boundary. */
import { getImageProxyUrl } from "@follow/utils/img-proxy"
import type { EntryListResponse, EntryMedia } from "@follow-app/client-sdk"
import { FeedViewType } from "@follow-app/client-sdk"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import DOMPurify from "dompurify"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"

import { followApi } from "../lib/api"

const PAGE_SIZE = 20
const UNREAD_ONLY_STORAGE_KEY = "follow:pwa:unreadOnly"
const INTERACTIVE_FEED_TAGS = ["button", "form", "input", "option", "select", "textarea"]
const SOCIAL_LIST_FORBIDDEN_TAGS = [
  ...INTERACTIVE_FEED_TAGS,
  "a",
  "audio",
  "iframe",
  "img",
  "source",
  "video",
]

const TIMELINE_VIEWS = [
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

type EntryListItem = Omit<EntryListResponse["data"][number], "entries"> & {
  entries: EntryListResponse["data"][number]["entries"] & { content?: string | null }
}
type TimelineView = (typeof TIMELINE_VIEWS)[number]
type PreviewMedia = { imageUrl: string; media: EntryMedia }

export const getTimelineView = (slug: string | null): TimelineView =>
  TIMELINE_VIEWS.find((item) => item.slug === slug) ?? TIMELINE_VIEWS[0]

export const getPreviewMedia = (media: EntryMedia[] | null | undefined): PreviewMedia[] => {
  const previews = new Map<string, EntryMedia>()

  for (const item of media ?? []) {
    const imageUrl = item.type === "photo" ? item.url : item.preview_image_url
    if (imageUrl && !previews.has(imageUrl)) previews.set(imageUrl, item)
  }

  return Array.from(previews, ([imageUrl, item]) => ({ imageUrl, media: item }))
}

const getTimelineImageUrl = (url: string, width: number, height?: number) =>
  getImageProxyUrl({ canUseProxy: true, height, url, width })

const getTimelineHref = (view: TimelineView) =>
  view.view === FeedViewType.Articles ? "/" : `/?view=${view.slug}`

const getEntryHref = (entryId: string, view: TimelineView) =>
  view.view === FeedViewType.Articles
    ? `/entries/${entryId}`
    : `/entries/${entryId}?view=${view.slug}`

export const getNextPageParam = (page: { data: Array<{ entries: { publishedAt: string } }> }) =>
  page.data.at(-1)?.entries.publishedAt

const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))

export const sanitizeEntryContent = (content: string) =>
  DOMPurify.sanitize(content, {
    FORBID_ATTR: ["style"],
    FORBID_TAGS: INTERACTIVE_FEED_TAGS,
  })

export const sanitizeSocialListContent = (content: string) =>
  DOMPurify.sanitize(content, {
    FORBID_ATTR: ["style"],
    FORBID_TAGS: SOCIAL_LIST_FORBIDDEN_TAGS,
  })

function TimelineViewNav({ current }: { current: TimelineView }) {
  return (
    <nav aria-label="Timeline views" className="mt-3">
      <ul className="inline-flex items-center gap-1">
        {TIMELINE_VIEWS.map((view) => {
          const isActive = current.view === view.view
          return (
            <li key={view.slug}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-medium transition-colors ${isActive ? "border-accent text-accent" : "border-transparent text-text-tertiary hover:text-text-secondary"}`}
                to={getTimelineHref(view)}
              >
                <i aria-hidden className={`${view.icon} size-4`} />
                <span>{view.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function FeedAvatar({ item }: { item: EntryListItem }) {
  const source = item.entries.authorAvatar || item.feeds.image

  return source ? (
    <img alt="" className="size-8 shrink-0 rounded-full object-cover" loading="lazy" src={source} />
  ) : (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-quinary text-text-tertiary"
    >
      <i className="i-mgc-user-3-cute-re size-4" />
    </span>
  )
}

function ArticleListItem({
  item,
  selectedId,
  view,
}: {
  item: EntryListItem
  selectedId?: string
  view: TimelineView
}) {
  const entry = item.entries
  const feed = item.feeds

  return (
    <li className="border-b border-fill-tertiary">
      <Link
        aria-current={selectedId === entry.id ? "page" : undefined}
        className="block min-h-24 px-4 py-3 transition-colors hover:bg-fill-quinary focus-visible:bg-fill-quinary focus-visible:outline-none"
        to={getEntryHref(entry.id, view)}
      >
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          {feed.image ? (
            <img alt="" className="size-4 rounded" loading="lazy" src={feed.image} />
          ) : (
            <span aria-hidden className="size-2 rounded-full bg-accent" />
          )}
          <span className="min-w-0 flex-1 truncate">{feed.title || feed.url}</span>
          <time dateTime={entry.publishedAt}>{formatDate(entry.publishedAt)}</time>
        </div>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-5">
          {entry.title || "Untitled"}
        </h3>
        {entry.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-text-secondary">
            {entry.description}
          </p>
        )}
      </Link>
    </li>
  )
}

function SocialListItem({
  item,
  selectedId,
  view,
}: {
  item: EntryListItem
  selectedId?: string
  view: TimelineView
}) {
  const entry = item.entries
  const feed = item.feeds
  const media = getPreviewMedia(entry.media)
  const visibleMedia = media.slice(0, 4)
  const safeContent = useMemo(
    () => sanitizeSocialListContent(entry.content || entry.description || entry.title || ""),
    [entry.content, entry.description, entry.title],
  )

  return (
    <li className="border-b border-fill-tertiary">
      <Link
        aria-current={selectedId === entry.id ? "page" : undefined}
        className="relative flex gap-3 px-4 py-4 transition-colors hover:bg-fill-quinary focus-visible:bg-fill-quinary focus-visible:outline-none"
        to={getEntryHref(entry.id, view)}
      >
        {!item.read && (
          <span className="absolute left-1.5 top-7 size-2 rounded-full bg-accent">
            <span className="sr-only">Unread</span>
          </span>
        )}
        <FeedAvatar item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
              {entry.author || feed.title || feed.url}
            </span>
            <span aria-hidden>·</span>
            <time className="shrink-0" dateTime={entry.publishedAt}>
              {formatDate(entry.publishedAt)}
            </time>
          </div>
          {safeContent && (
            <div
              className="line-clamp-7 mt-1.5 whitespace-pre-wrap text-[15px] leading-[22px]"
              dangerouslySetInnerHTML={{ __html: safeContent }}
            />
          )}
          {visibleMedia.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-1 overflow-hidden rounded-xl">
              {visibleMedia.map((preview, index) => {
                const isWide =
                  visibleMedia.length === 1 ||
                  (visibleMedia.length % 2 === 1 && index === visibleMedia.length - 1)
                return (
                  <div
                    className={`relative overflow-hidden bg-fill-quinary ${isWide ? "col-span-2 aspect-[2/1]" : "aspect-square"}`}
                    key={preview.imageUrl}
                  >
                    <img
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      src={getTimelineImageUrl(preview.imageUrl, isWide ? 800 : 400, 400)}
                    />
                    {preview.media.type === "video" && (
                      <span className="absolute inset-0 grid place-items-center bg-black/15 text-white">
                        <i aria-hidden className="i-mgc-play-cute-fi size-8 drop-shadow" />
                        <span className="sr-only">Video</span>
                      </span>
                    )}
                    {index === 3 && media.length > visibleMedia.length && (
                      <span className="absolute inset-0 grid place-items-center bg-black/45 text-lg font-semibold text-white">
                        +{media.length - visibleMedia.length}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Link>
    </li>
  )
}

function PictureListItem({ item, view }: { item: EntryListItem; view: TimelineView }) {
  const entry = item.entries
  const feed = item.feeds
  const media = getPreviewMedia(entry.media)
  const firstMedia = media[0]

  return (
    <li className="mb-2 break-inside-avoid">
      <Link
        className="block overflow-hidden rounded-xl bg-fill-quinary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        to={getEntryHref(entry.id, view)}
      >
        <div className="relative">
          {firstMedia ? (
            <img
              alt=""
              className={
                firstMedia.media.width && firstMedia.media.height
                  ? "h-auto w-full"
                  : "aspect-square w-full object-cover"
              }
              height={firstMedia.media.height}
              loading="lazy"
              src={getTimelineImageUrl(firstMedia.imageUrl, 600)}
              width={firstMedia.media.width}
            />
          ) : (
            <span
              aria-hidden
              className="grid aspect-square w-full place-items-center text-text-tertiary"
            >
              <i className="i-mgc-pic-cute-re size-7" />
            </span>
          )}
          {!item.read && (
            <span className="absolute left-2 top-2 size-2 rounded-full bg-accent ring-2 ring-black/20">
              <span className="sr-only">Unread</span>
            </span>
          )}
          {media.length > 1 && (
            <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
              1/{media.length}
            </span>
          )}
        </div>
        <div className="p-2.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5">
            {entry.title || feed.title || "Untitled"}
          </h3>
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-text-tertiary">
            {feed.image && (
              <img alt="" className="size-4 rounded" loading="lazy" src={feed.image} />
            )}
            <span className="min-w-0 flex-1 truncate">{feed.title || feed.url}</span>
            <time className="shrink-0" dateTime={entry.publishedAt}>
              {formatDate(entry.publishedAt)}
            </time>
          </div>
        </div>
      </Link>
    </li>
  )
}

function EntryList({ selectedId, view }: { selectedId?: string; view: TimelineView }) {
  const [unreadOnly, setUnreadOnly] = useState(
    () => localStorage.getItem(UNREAD_ONLY_STORAGE_KEY) === "true",
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const query = useInfiniteQuery({
    queryKey: ["entries", view.view, unreadOnly],
    queryFn: ({ pageParam }) =>
      followApi.entries.list({
        limit: PAGE_SIZE,
        publishedAfter: pageParam,
        read: unreadOnly ? false : undefined,
        view: view.view,
        withContent: view.view === FeedViewType.SocialMedia,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam,
  })
  const { fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage } = query
  const items = query.data?.pages.flatMap((page) => page.data) ?? []
  const Heading = selectedId ? "h2" : "h1"

  useEffect(() => {
    const root = scrollRef.current
    const target = loadMoreRef.current
    if (
      !root ||
      !target ||
      !hasNextPage ||
      isFetchNextPageError ||
      !("IntersectionObserver" in window)
    ) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || !hasNextPage || isFetchingNextPage || isFetchNextPageError) {
          return
        }
        void fetchNextPage({ cancelRefetch: false })
      },
      { root, rootMargin: "0px 0px 200px", threshold: 0 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage, unreadOnly, view.view])

  return (
    <section
      aria-busy={query.isPending || isFetchingNextPage}
      aria-label={`${view.label} timeline`}
      className={`${selectedId ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-col border-fill-tertiary md:border-r`}
    >
      <header className="shrink-0 border-b border-fill-tertiary px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Heading className="text-title2 font-semibold outline-none" tabIndex={-1}>
              {view.title}
            </Heading>
            <p className="mt-0.5 text-xs text-text-tertiary">{view.description}</p>
          </div>
          <button
            aria-label={unreadOnly ? "Show all entries" : "Show unread entries only"}
            aria-pressed={unreadOnly}
            className={`-my-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-xs font-medium transition-colors focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${unreadOnly ? "text-accent" : "text-text-tertiary"}`}
            type="button"
            onClick={() => {
              const nextUnreadOnly = !unreadOnly
              localStorage.setItem(UNREAD_ONLY_STORAGE_KEY, String(nextUnreadOnly))
              setUnreadOnly(nextUnreadOnly)
            }}
          >
            <i aria-hidden className={`i-mgc-round-cute-${unreadOnly ? "fi" : "re"} size-4`} />
            <span>Unread</span>
          </button>
        </div>
        <TimelineViewNav current={view} />
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        key={`${view.view}:${unreadOnly}`}
        ref={scrollRef}
      >
        {query.isPending && <p className="p-5 text-sm text-text-secondary">Loading timeline…</p>}
        {query.isError && items.length === 0 && (
          <div className="p-5 text-sm">
            <p className="text-red">Unable to load your timeline.</p>
            <button className="mt-3 min-h-11 text-accent" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        )}
        {!query.isPending && !query.isError && items.length === 0 && (
          <p className="p-5 text-sm text-text-secondary">
            {unreadOnly ? "You're all caught up." : `No ${view.label.toLowerCase()} yet.`}
          </p>
        )}
        {view.view === FeedViewType.Pictures ? (
          <ol className="columns-2 gap-2 p-2">
            {items.map((item) => (
              <PictureListItem item={item} key={item.entries.id} view={view} />
            ))}
          </ol>
        ) : (
          <ol>
            {items.map((item) =>
              view.view === FeedViewType.SocialMedia ? (
                <SocialListItem
                  item={item}
                  key={item.entries.id}
                  selectedId={selectedId}
                  view={view}
                />
              ) : (
                <ArticleListItem
                  item={item}
                  key={item.entries.id}
                  selectedId={selectedId}
                  view={view}
                />
              ),
            )}
          </ol>
        )}
        {hasNextPage && (
          <div className="p-4 text-center" ref={loadMoreRef}>
            <button
              className="min-h-11 rounded-xl border border-fill-tertiary px-5 text-sm font-medium disabled:opacity-50"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage({ cancelRefetch: false })}
            >
              {isFetchingNextPage ? "Loading…" : isFetchNextPageError ? "Try again" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function EntryDetail({ backTo, entryId }: { backTo: string; entryId: string }) {
  const query = useQuery({
    queryKey: ["entry", entryId],
    queryFn: async () => (await followApi.entries.get({ id: entryId })).data,
  })
  const entry = query.data?.entries
  const feed = query.data?.feeds
  const safeContent = useMemo(
    () => sanitizeEntryContent(entry?.content || entry?.description || ""),
    [entry?.content, entry?.description],
  )

  return (
    <section aria-busy={query.isPending} className="min-h-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-[680px] px-5 py-4 md:px-8 md:py-8">
        <Link
          className="inline-flex min-h-11 items-center gap-1 text-sm text-accent md:hidden"
          to={backTo}
        >
          <i aria-hidden className="i-mgc-left-cute-re size-4" />
          Back
        </Link>
        {query.isPending && <p className="py-8 text-sm text-text-secondary">Loading article…</p>}
        {query.isError && (
          <div className="py-8 text-sm">
            <h1 className="text-title2 font-semibold outline-none" tabIndex={-1}>
              Unable to load this article
            </h1>
            <button className="mt-3 min-h-11 text-accent" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        )}
        {query.isSuccess && (!entry || !feed) && (
          <div className="py-8">
            <h1 className="text-title2 font-semibold outline-none" tabIndex={-1}>
              Article not found
            </h1>
            <Link
              className="mt-3 inline-flex min-h-11 items-center text-sm text-accent"
              to={backTo}
            >
              Return to your timeline
            </Link>
          </div>
        )}
        {entry && feed && (
          <article aria-labelledby="entry-title">
            <p className="text-sm text-text-secondary">{feed.title || feed.url}</p>
            <h1
              id="entry-title"
              className="mt-2 text-title1 font-semibold leading-tight tracking-tight outline-none"
              tabIndex={-1}
            >
              {entry.title || "Untitled"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
              {entry.author && <span>{entry.author}</span>}
              <time dateTime={entry.publishedAt}>{formatDate(entry.publishedAt)}</time>
              {entry.url && (
                <a
                  className="inline-flex min-h-11 items-center text-accent"
                  href={entry.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Original
                </a>
              )}
            </div>
            {safeContent ? (
              <div
                className="entry-content mt-6"
                dangerouslySetInnerHTML={{ __html: safeContent }}
              />
            ) : (
              <p className="mt-6 text-text-secondary">No article content is available.</p>
            )}
          </article>
        )}
      </div>
    </section>
  )
}

function EmptyDetail() {
  return (
    <section className="hidden place-items-center p-8 text-center text-sm text-text-tertiary md:grid">
      Select an item to open it here.
    </section>
  )
}

export function Component() {
  const { entryId } = useParams<{ entryId: string }>()
  const [searchParams] = useSearchParams()
  const view = getTimelineView(searchParams.get("view"))

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
      <EntryList selectedId={entryId} view={view} />
      {entryId ? <EntryDetail backTo={getTimelineHref(view)} entryId={entryId} /> : <EmptyDetail />}
    </div>
  )
}
