import { Link } from "react-router"

import type { EntryListItem } from "../../domain/entry"
import { entryIdOf } from "../../domain/entry"
import { formatDate } from "../../domain/format"
import { getPreviewMedia, getTimelineImageUrl } from "../../domain/media"
import type { TimelineView } from "./model"
import { getEntryHref } from "./model"

export function PictureEntryCard({
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
  const media = getPreviewMedia(entry.media)
  const firstMedia = media[0]

  return (
    <li className="mb-2 break-inside-avoid" data-entry-id={entryIdOf(item)}>
      <Link
        aria-current={selectedId === entry.id ? "page" : undefined}
        className="block overflow-hidden rounded-xl bg-fill-quinary transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        to={getEntryHref(entry.id, view)}
        onClick={onOpen}
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
