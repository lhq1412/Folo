import { Link } from "react-router"

import type { EntryListItem } from "../../domain/entry"
import { entryIdOf } from "../../domain/entry"
import { formatDate } from "../../domain/format"
import { getFeedIconUrl } from "../../domain/media"
import type { TimelineView } from "./model"
import { getEntryHref } from "./model"

export function ArticleEntryCard({
  item,
  onOpen,
  selectedId,
  view,
}: {
  item: EntryListItem
  onOpen?: () => void
  selectedId?: string
  view: TimelineView
}) {
  const entry = item.entries
  const feed = item.feeds
  const unread = !item.read

  return (
    <li className="timeline-row border-b border-fill-tertiary" data-entry-id={entryIdOf(item)}>
      <Link
        aria-current={selectedId === entry.id ? "page" : undefined}
        className="relative block min-h-24 px-4 py-3 transition-colors hover:bg-fill-quinary focus-visible:bg-fill-quinary focus-visible:outline-none"
        to={getEntryHref(entry.id, view)}
        onClick={onOpen}
      >
        {unread && (
          <span className="absolute left-1.5 top-8 size-2 rounded-full bg-accent">
            <span className="sr-only">Unread</span>
          </span>
        )}
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          {feed.image ? (
            <img
              alt=""
              className="size-4 rounded"
              decoding="async"
              loading="lazy"
              src={getFeedIconUrl(feed.image)}
            />
          ) : (
            <span aria-hidden className="size-2 rounded-full bg-accent" />
          )}
          <span className="min-w-0 flex-1 truncate">{feed.title || feed.url}</span>
          <time dateTime={entry.publishedAt}>{formatDate(entry.publishedAt)}</time>
        </div>
        <h3
          className={`mt-2 line-clamp-2 text-[15px] leading-5 ${unread ? "font-semibold text-text" : "font-medium text-text-secondary"}`}
        >
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
