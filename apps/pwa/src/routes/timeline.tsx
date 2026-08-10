/* eslint-disable react-dom/no-dangerously-set-innerhtml -- Feed HTML is sanitized with DOMPurify at the render boundary. */
import type { EntryListResponse } from "@follow-app/client-sdk"
import { FeedViewType } from "@follow-app/client-sdk"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import DOMPurify from "dompurify"
import { useMemo } from "react"
import { Link, useParams } from "react-router"

import { followApi } from "../lib/api"

const PAGE_SIZE = 20
const INTERACTIVE_FEED_TAGS = ["button", "form", "input", "option", "select", "textarea"]

export const getNextPageParam = (page: Pick<EntryListResponse, "data">) =>
  page.data.length < PAGE_SIZE ? undefined : page.data.at(-1)?.entries.publishedAt

const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))

export const sanitizeEntryContent = (content: string) =>
  DOMPurify.sanitize(content, {
    FORBID_ATTR: ["style"],
    FORBID_TAGS: INTERACTIVE_FEED_TAGS,
  })

function EntryList({ selectedId }: { selectedId?: string }) {
  const query = useInfiniteQuery({
    queryKey: ["entries", FeedViewType.Articles],
    queryFn: ({ pageParam }) =>
      followApi.entries.list({
        limit: PAGE_SIZE,
        publishedAfter: pageParam,
        view: FeedViewType.Articles,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam,
  })
  const items = query.data?.pages.flatMap((page) => page.data) ?? []
  const Heading = selectedId ? "h2" : "h1"

  return (
    <section
      aria-busy={query.isPending}
      aria-label="Timeline"
      className={`${selectedId ? "hidden md:flex" : "flex"} min-h-0 flex-col border-fill-tertiary md:border-r`}
    >
      <header className="shrink-0 border-b border-fill-tertiary px-4 py-4">
        <Heading className="text-title2 font-semibold outline-none" tabIndex={-1}>
          Today
        </Heading>
        <p className="mt-0.5 text-xs text-text-tertiary">Your latest articles</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {query.isPending && <p className="p-5 text-sm text-text-secondary">Loading timeline…</p>}
        {query.isError && (
          <div className="p-5 text-sm">
            <p className="text-red">Unable to load your timeline.</p>
            <button className="mt-3 min-h-11 text-accent" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        )}
        {!query.isPending && !query.isError && items.length === 0 && (
          <p className="p-5 text-sm text-text-secondary">No articles yet.</p>
        )}
        <ol>
          {items.map((item) => {
            const entry = item.entries
            const feed = item.feeds
            return (
              <li key={entry.id} className="border-b border-fill-tertiary">
                <Link
                  aria-current={selectedId === entry.id ? "page" : undefined}
                  className="block min-h-24 px-4 py-3 transition-colors hover:bg-fill-quinary focus-visible:bg-fill-quinary focus-visible:outline-none"
                  to={`/entries/${entry.id}`}
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
          })}
        </ol>
        {query.hasNextPage && (
          <div className="p-4 text-center">
            <button
              className="min-h-11 rounded-xl border border-fill-tertiary px-5 text-sm font-medium disabled:opacity-50"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function EntryDetail({ entryId }: { entryId: string }) {
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
          to="/"
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
            <Link className="mt-3 inline-flex min-h-11 items-center text-sm text-accent" to="/">
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
      Select an article to read it here.
    </section>
  )
}

export function Component() {
  const { entryId } = useParams<{ entryId: string }>()

  return (
    <div className="grid h-full min-h-0 md:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
      <EntryList selectedId={entryId} />
      {entryId ? <EntryDetail entryId={entryId} /> : <EmptyDetail />}
    </div>
  )
}
