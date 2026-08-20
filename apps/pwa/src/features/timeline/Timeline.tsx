import { FeedViewType } from "@follow-app/client-sdk"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"

import type { EntryListItem } from "../../domain/entry"
import { ArticleEntryCard } from "./ArticleEntryCard"
import type { TimelineView } from "./model"
import {
  getTimelineHref,
  isPicturesTimeline,
  TIMELINE_VIEWS,
  timelineCardLayout,
  UNREAD_ONLY_STORAGE_KEY,
} from "./model"
import { PictureEntryCard } from "./PictureEntryCard"
import { savedInfiniteQueryOptions, timelineInfiniteQueryOptions } from "./queries"
import { timelineScrollKey } from "./scroll-restoration"
import { SocialEntryCard } from "./SocialEntryCard"
import { useTimelineScrollRestoration } from "./use-timeline-scroll"

function TimelineViewNav({
  current,
  onNavigate,
}: {
  current: TimelineView
  onNavigate: () => void
}) {
  return (
    <nav aria-label="Timeline views" className="mt-3">
      <ul className="inline-flex items-center gap-1 overflow-x-auto">
        {TIMELINE_VIEWS.map((view) => {
          const isActive = current.slug === view.slug
          return (
            <li key={view.slug}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-medium transition-colors ${isActive ? "border-accent text-accent" : "border-transparent text-text-tertiary hover:text-text-secondary"}`}
                to={getTimelineHref(view)}
                onClick={onNavigate}
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

function TimelineEntry({
  item,
  onOpen,
  selectedId,
  view,
}: {
  item: EntryListItem
  onOpen: () => void
  selectedId?: string
  view: TimelineView
}) {
  const layout = timelineCardLayout(item, view)
  if (layout === "social") {
    return <SocialEntryCard item={item} selectedId={selectedId} view={view} onOpen={onOpen} />
  }
  if (layout === "pictures") {
    return <PictureEntryCard item={item} selectedId={selectedId} view={view} onOpen={onOpen} />
  }
  return <ArticleEntryCard item={item} selectedId={selectedId} view={view} onOpen={onOpen} />
}

export function Timeline({ selectedId, view }: { selectedId?: string; view: TimelineView }) {
  const [unreadOnly, setUnreadOnly] = useState(
    () => localStorage.getItem(UNREAD_ONLY_STORAGE_KEY) === "true",
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const feedQuery = useInfiniteQuery({
    ...timelineInfiniteQueryOptions(
      view.kind === "feed" ? view.view : FeedViewType.Articles,
      unreadOnly,
    ),
    enabled: view.kind === "feed",
  })
  const savedQuery = useInfiniteQuery({
    ...savedInfiniteQueryOptions(unreadOnly),
    enabled: view.kind === "saved",
  })
  const query = view.kind === "saved" ? savedQuery : feedQuery
  const { fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage } = query
  const items = (query.data?.pages.flatMap((page) => page.data) ?? []) as EntryListItem[]
  const Heading = selectedId ? "h2" : "h1"
  const snapshotKey = timelineScrollKey(view.slug, unreadOnly)
  const { captureNow } = useTimelineScrollRestoration({
    layoutReady: !query.isPending,
    scrollerRef: scrollRef,
    selectedId,
    snapshotKey,
  })

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
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage, snapshotKey])

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
              captureNow()
              const nextUnreadOnly = !unreadOnly
              localStorage.setItem(UNREAD_ONLY_STORAGE_KEY, String(nextUnreadOnly))
              setUnreadOnly(nextUnreadOnly)
            }}
          >
            <i aria-hidden className={`i-mgc-round-cute-${unreadOnly ? "fi" : "re"} size-4`} />
            <span>Unread</span>
          </button>
        </div>
        <TimelineViewNav current={view} onNavigate={captureNow} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" ref={scrollRef}>
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
            {unreadOnly
              ? "You're all caught up."
              : view.kind === "saved"
                ? "No saved entries yet."
                : `No ${view.label.toLowerCase()} yet.`}
          </p>
        )}
        {isPicturesTimeline(view) ? (
          <ol className="columns-2 gap-2 p-2">
            {items.map((item) => (
              <TimelineEntry
                item={item}
                key={item.entries.id}
                selectedId={selectedId}
                view={view}
                onOpen={captureNow}
              />
            ))}
          </ol>
        ) : (
          <ol>
            {items.map((item) => (
              <TimelineEntry
                item={item}
                key={item.entries.id}
                selectedId={selectedId}
                view={view}
                onOpen={captureNow}
              />
            ))}
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
