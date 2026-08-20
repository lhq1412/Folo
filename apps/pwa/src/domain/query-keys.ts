import type { FeedViewType } from "@follow-app/client-sdk"

/**
 * Central query-key factory for Folo Lite.
 *
 * Timeline, saved, and entry-session caches share these keys so read/unread
 * and save/unsave mutations can patch every relevant page in place.
 */
export const queryKeys = {
  entries: {
    root: () => ["entries"] as const,
    timeline: (view: FeedViewType, unreadOnly: boolean) =>
      ["entries", "timeline", view, unreadOnly] as const,
    saved: (unreadOnly: boolean) => ["entries", "saved", unreadOnly] as const,
  },
  entry: {
    root: () => ["entry"] as const,
    detail: (id: string) => ["entry", id] as const,
    session: (id: string) => ["entry-session", id] as const,
  },
  subscriptions: {
    root: () => ["subscriptions"] as const,
  },
}

export const isUnreadOnlyEntriesQueryKey = (queryKey: readonly unknown[]) => {
  if (queryKey[0] !== "entries") return false
  if (queryKey[1] === "timeline") return queryKey[3] === true
  if (queryKey[1] === "saved") return queryKey[2] === true
  return false
}

export const isSavedEntriesQueryKey = (queryKey: readonly unknown[]) =>
  queryKey[0] === "entries" && queryKey[1] === "saved"
