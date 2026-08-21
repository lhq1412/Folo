// @vitest-environment jsdom

import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import { MAX_RETAINED_PAGES } from "./model"
import { savedInfiniteQueryOptions, timelineInfiniteQueryOptions } from "./queries"

describe("timeline queries", () => {
  test("evicts oldest infinite pages after the retained-page cap", () => {
    expect(timelineInfiniteQueryOptions(FeedViewType.Articles, false).maxPages).toBe(
      MAX_RETAINED_PAGES,
    )
    expect(savedInfiniteQueryOptions(true).maxPages).toBe(MAX_RETAINED_PAGES)
    expect(timelineInfiniteQueryOptions(FeedViewType.Articles, false).refetchOnReconnect).toBe(true)
  })
})
