import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import { isSavedEntriesQueryKey, isUnreadOnlyEntriesQueryKey, queryKeys } from "./query-keys"

describe("query key factory", () => {
  test("keeps timeline, saved, entry, and session caches addressable without duplicated arrays", () => {
    expect(queryKeys.entries.timeline(FeedViewType.Articles, false)).toEqual([
      "entries",
      "timeline",
      FeedViewType.Articles,
      false,
    ])
    expect(queryKeys.entries.timeline(FeedViewType.SocialMedia, true)).toEqual([
      "entries",
      "timeline",
      FeedViewType.SocialMedia,
      true,
    ])
    expect(queryKeys.entries.saved(true)).toEqual(["entries", "saved", true])
    expect(queryKeys.entry.detail("entry-1")).toEqual(["entry", "entry-1"])
    expect(queryKeys.entry.session("entry-1")).toEqual(["entry-session", "entry-1"])
    expect(queryKeys.subscriptions.root()).toEqual(["subscriptions"])
  })

  test("detects unread-only and saved list keys", () => {
    expect(
      isUnreadOnlyEntriesQueryKey(queryKeys.entries.timeline(FeedViewType.Articles, true)),
    ).toBe(true)
    expect(isUnreadOnlyEntriesQueryKey(queryKeys.entries.saved(true))).toBe(true)
    expect(isUnreadOnlyEntriesQueryKey(queryKeys.entries.saved(false))).toBe(false)
    expect(isSavedEntriesQueryKey(queryKeys.entries.saved(false))).toBe(true)
    expect(isSavedEntriesQueryKey(queryKeys.entries.timeline(FeedViewType.Articles, false))).toBe(
      false,
    )
  })
})
