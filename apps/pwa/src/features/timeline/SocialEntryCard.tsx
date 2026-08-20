/* eslint-disable react-dom/no-dangerously-set-innerhtml -- Feed HTML is sanitized with DOMPurify at the render boundary. */
import { useMemo } from "react"
import { Link } from "react-router"

import type { EntryListItem } from "../../domain/entry"
import { entryIdOf } from "../../domain/entry"
import { formatDate } from "../../domain/format"
import {
  getAvatarUrl,
  getPreviewMedia,
  getTimelineImageUrl,
  IMAGE_PIXEL_SIZES,
} from "../../domain/media"
import { sanitizeSocialListContent } from "../../domain/sanitize"
import type { TimelineView } from "./model"
import { getEntryHref } from "./model"

function FeedAvatar({ item }: { item: EntryListItem }) {
  const source = item.entries.authorAvatar || item.feeds.image

  return source ? (
    <img
      alt=""
      className="size-8 shrink-0 rounded-full object-cover"
      decoding="async"
      loading="lazy"
      src={getAvatarUrl(source)}
    />
  ) : (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-quinary text-text-tertiary"
    >
      <i className="i-mgc-user-3-cute-re size-4" />
    </span>
  )
}

export function SocialEntryCard({
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
  const visibleMedia = media.slice(0, 4)
  const safeContent = useMemo(
    () => sanitizeSocialListContent(entry.content || entry.description || entry.title || ""),
    [entry.content, entry.description, entry.title],
  )

  return (
    <li className="timeline-row border-b border-fill-tertiary" data-entry-id={entryIdOf(item)}>
      <Link
        aria-current={selectedId === entry.id ? "page" : undefined}
        className="relative flex gap-3 px-4 py-4 transition-colors hover:bg-fill-quinary focus-visible:bg-fill-quinary focus-visible:outline-none"
        to={getEntryHref(entry.id, view)}
        onClick={onOpen}
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
                      decoding="async"
                      loading="lazy"
                      src={getTimelineImageUrl(
                        preview.imageUrl,
                        isWide ? IMAGE_PIXEL_SIZES.socialGridWide : IMAGE_PIXEL_SIZES.socialGrid,
                        IMAGE_PIXEL_SIZES.socialGrid,
                      )}
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
