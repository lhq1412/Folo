import type { FeedViewType } from "@follow-app/client-sdk"

/**
 * Central query-key factory for Folo Lite.
 *
 * Keep mutations in the feature that owns the user action (timeline read
 * state, saved/starred entries, subscriptions) and update these keys instead
 * of duplicating ad-hoc arrays. That lets optimistic updates in #34/#35 hit
 * the same caches as timeline, reader, and subscription queries.
 */
export const queryKeys = {
  entries: {
    root: () => ["entries"] as const,
    list: (view: FeedViewType, unreadOnly: boolean) => ["entries", view, unreadOnly] as const,
  },
  entry: {
    root: () => ["entry"] as const,
    detail: (id: string) => ["entry", id] as const,
  },
  subscriptions: {
    root: () => ["subscriptions"] as const,
  },
}
