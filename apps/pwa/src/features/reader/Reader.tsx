/* eslint-disable react-dom/no-dangerously-set-innerhtml -- Feed HTML is sanitized with DOMPurify at the render boundary. */
import { useQuery } from "@tanstack/react-query"
import { useLayoutEffect, useMemo, useRef } from "react"
import { Link } from "react-router"

import { formatDate } from "../../domain/format"
import { sanitizeEntryContent } from "../../domain/sanitize"
import { useMarkEntryRead, useMarkEntryUnread } from "../timeline/read-mutations"
import { useSaveEntry, useUnsaveEntry } from "../timeline/star-mutations"
import { entryDetailQueryOptions, sessionView, useEntrySessionQuery } from "./queries"

export function Reader({ backTo, entryId }: { backTo: string; entryId: string }) {
  const detailQuery = useQuery(entryDetailQueryOptions(entryId))
  const sessionQuery = useEntrySessionQuery(entryId)
  const markRead = useMarkEntryRead()
  const markUnread = useMarkEntryUnread()
  const saveEntry = useSaveEntry()
  const unsaveEntry = useUnsaveEntry()
  const autoMarkedRef = useRef<string | null>(null)
  const markReadRef = useRef(markRead.mutate)
  markReadRef.current = markRead.mutate

  const entry = detailQuery.data?.entries
  const feed = detailQuery.data?.feeds
  const session = sessionQuery.data
  const read = session?.read ?? false
  const starred = session?.starred ?? false
  const isInbox = session?.isInbox ?? false
  const safeContent = useMemo(
    () => sanitizeEntryContent(entry?.content || entry?.description || ""),
    [entry?.content, entry?.description],
  )

  useLayoutEffect(() => {
    if (!session) return
    if (autoMarkedRef.current === entryId) return
    autoMarkedRef.current = entryId
    if (!session.read) markReadRef.current({ entryId, isInbox: session.isInbox })
  }, [entryId, session])

  const actionError =
    markRead.isError || markUnread.isError || saveEntry.isError || unsaveEntry.isError
  const retryFailedAction = () => {
    if (markRead.isError && markRead.variables) markRead.mutate(markRead.variables)
    else if (markUnread.isError && markUnread.variables) markUnread.mutate(markUnread.variables)
    else if (saveEntry.isError && saveEntry.variables) saveEntry.mutate(saveEntry.variables)
    else if (unsaveEntry.isError && unsaveEntry.variables) unsaveEntry.mutate(unsaveEntry.variables)
  }

  return (
    <section
      aria-busy={detailQuery.isPending}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-fill-tertiary px-2 py-1">
        <Link
          aria-label="Back to timeline"
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-accent"
          to={backTo}
        >
          <i aria-hidden className="i-mgc-left-cute-re size-5" />
        </Link>
        <div className="min-w-0 flex-1" />
        <button
          aria-label={starred ? "Remove from saved" : "Save"}
          aria-pressed={starred}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center ${starred ? "text-orange" : "text-text-secondary"}`}
          type="button"
          onClick={() => {
            if (starred) {
              unsaveEntry.mutate({ entryId })
              return
            }
            saveEntry.mutate({
              entryId,
              listItem: session?.listItem,
              view: sessionView(session),
            })
          }}
        >
          <i aria-hidden className={`i-mgc-star-cute-${starred ? "fi" : "re"} size-5`} />
        </button>
        <button
          aria-label={read ? "Mark unread" : "Mark read"}
          aria-pressed={read}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center ${read ? "text-text-tertiary" : "text-accent"}`}
          type="button"
          onClick={() => {
            if (read) markUnread.mutate({ entryId, isInbox })
            else markRead.mutate({ entryId, isInbox })
          }}
        >
          <i aria-hidden className={`i-mgc-round-cute-${read ? "re" : "fi"} size-5`} />
        </button>
      </header>
      {actionError && (
        <p
          aria-live="polite"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-fill-tertiary px-4 py-2 text-sm text-red"
        >
          Couldn't update this entry.
          <button className="min-h-11 text-accent" type="button" onClick={retryFailedAction}>
            Retry
          </button>
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-[680px] px-5 py-4 md:px-8 md:py-8">
          {detailQuery.isPending && (
            <p className="py-8 text-sm text-text-secondary">Loading article…</p>
          )}
          {detailQuery.isError && (
            <div className="py-8 text-sm">
              <h1 className="text-title2 font-semibold outline-none" tabIndex={-1}>
                Unable to load this article
              </h1>
              <button
                className="mt-3 min-h-11 text-accent"
                onClick={() => void detailQuery.refetch()}
              >
                Try again
              </button>
            </div>
          )}
          {detailQuery.isSuccess && (!entry || !feed) && (
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
      </div>
    </section>
  )
}
