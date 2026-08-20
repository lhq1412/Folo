import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import { queryKeys } from "./query-keys"

describe("query key factory", () => {
  test("keeps timeline, entry, and subscription caches addressable without duplicated arrays", () => {
    expect(queryKeys.entries.list(FeedViewType.Articles, false)).toEqual([
      "entries",
      FeedViewType.Articles,
      false,
    ])
    expect(queryKeys.entries.list(FeedViewType.SocialMedia, true)).toEqual([
      "entries",
      FeedViewType.SocialMedia,
      true,
    ])
    expect(queryKeys.entry.detail("entry-1")).toEqual(["entry", "entry-1"])
    expect(queryKeys.subscriptions.root()).toEqual(["subscriptions"])
  })
})
