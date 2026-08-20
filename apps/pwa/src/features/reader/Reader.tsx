/* eslint-disable react-dom/no-dangerously-set-innerhtml -- Feed HTML is sanitized with DOMPurify at the render boundary. */
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { Link } from "react-router"

import { formatDate } from "../../domain/format"
import { sanitizeEntryContent } from "../../domain/sanitize"
import { entryDetailQueryOptions } from "./queries"

export function EmptyReader() {
  return (
    <section className="hidden place-items-center p-8 text-center text-sm text-text-tertiary md:grid">
      Select an item to open it here.
    </section>
  )
}

export function Reader({ backTo, entryId }: { backTo: string; entryId: string }) {
  const query = useQuery(entryDetailQueryOptions(entryId))
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
