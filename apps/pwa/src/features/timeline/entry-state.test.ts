import { FeedViewType } from "@follow-app/client-sdk"
import { QueryClient } from "@tanstack/react-query"
import { describe, expect, test } from "vitest"

import type { EntryListItem } from "../../domain/entry"
import type { EntryInfiniteData } from "../../domain/entry-cache"
import { queryKeys } from "../../domain/query-keys"
import {
  applyEntryReadState,
  applyEntryStarState,
  restoreQuerySnapshots,
  snapshotEntryQueries,
} from "./entry-state"

const item = (id: string, read = false, starred = false): EntryListItem =>
  ({
    collections: starred ? { createdAt: "2026-08-01T00:00:00.000Z" } : undefined,
    entries: { id, publishedAt: "2026-08-01T00:00:00.000Z" },
    feeds: { id: "feed-1" },
    from: [],
    read,
    view: FeedViewType.Articles,
  }) as unknown as EntryListItem

const infiniteData = (items: EntryListItem[][]): EntryInfiniteData => ({
  pageParams: items.map((_, index) => (index === 0 ? undefined : `cursor-${index}`)),
  pages: items.map((data) => ({ data })),
})

const ids = (data: EntryInfiniteData | undefined) =>
  data?.pages.flatMap((page) => page.data.map((entry) => entry.entries.id)) ?? []

const seed = (queryClient: QueryClient) => {
  queryClient.setQueryData(
    queryKeys.entries.timeline(FeedViewType.Articles, false),
    infiniteData([[item("a"), item("b")], [item("c")]]),
  )
  queryClient.setQueryData(
    queryKeys.entries.timeline(FeedViewType.Articles, true),
    infiniteData([[item("a"), item("b")]]),
  )
  queryClient.setQueryData(
    queryKeys.entries.timeline(FeedViewType.SocialMedia, false),
    infiniteData([[item("a")]]),
  )
  queryClient.setQueryData(
    queryKeys.entries.saved(false),
    infiniteData([[item("saved", true, true)]]),
  )
  queryClient.setQueryData(queryKeys.entry.session("a"), {
    id: "a",
    isInbox: false,
    listItem: item("a"),
    read: false,
    starred: false,
    view: FeedViewType.Articles,
  })
}

describe("entry cache mutations", () => {
  test("marks read across views, drops unread-only rows, and leaves pagination params in place", () => {
    const queryClient = new QueryClient()
    seed(queryClient)

    applyEntryReadState(queryClient, "a", true)

    const all = queryClient.getQueryData<EntryInfiniteData>(
      queryKeys.entries.timeline(FeedViewType.Articles, false),
    )
    const unread = queryClient.getQueryData<EntryInfiniteData>(
      queryKeys.entries.timeline(FeedViewType.Articles, true),
    )
    const social = queryClient.getQueryData<EntryInfiniteData>(
      queryKeys.entries.timeline(FeedViewType.SocialMedia, false),
    )

    expect(all?.pages[0]?.data[0]?.read).toBe(true)
    expect(all?.pages[1]?.data[0]?.entries.id).toBe("c")
    expect(ids(unread)).toEqual(["b"])
    expect(unread?.pageParams).toEqual([undefined])
    expect(social?.pages[0]?.data[0]?.read).toBe(true)
    expect(queryClient.getQueryData(queryKeys.entry.session("a"))).toMatchObject({ read: true })
  })

  test("rolls back a failed optimistic read from a snapshot", () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    const snapshots = snapshotEntryQueries(queryClient, "a")
    applyEntryReadState(queryClient, "a", true)
    restoreQuerySnapshots(queryClient, snapshots)

    expect(
      queryClient
        .getQueryData<EntryInfiniteData>(queryKeys.entries.timeline(FeedViewType.Articles, true))
        ?.pages[0]?.data.map((entry) => entry.entries.id),
    ).toEqual(["a", "b"])
    expect(queryClient.getQueryData(queryKeys.entry.session("a"))).toMatchObject({ read: false })
  })

  test("marking unread prepends the item back onto unread-only lists", () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    applyEntryReadState(queryClient, "a", true)
    applyEntryReadState(queryClient, "a", false, { prependItem: item("a") })

    expect(
      ids(
        queryClient.getQueryData<EntryInfiniteData>(
          queryKeys.entries.timeline(FeedViewType.Articles, true),
        ),
      ),
    ).toEqual(["a", "b"])
    expect(
      queryClient.getQueryData<EntryInfiniteData>(
        queryKeys.entries.timeline(FeedViewType.Articles, false),
      )?.pages[0]?.data[0]?.read,
    ).toBe(false)
  })

  test("starring patches every list and prepends onto saved caches", () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    applyEntryStarState(queryClient, "a", true, { listItem: item("a") })

    expect(
      queryClient.getQueryData<EntryInfiniteData>(
        queryKeys.entries.timeline(FeedViewType.Articles, false),
      )?.pages[0]?.data[0]?.collections,
    ).toBeTruthy()
    expect(
      ids(queryClient.getQueryData<EntryInfiniteData>(queryKeys.entries.saved(false))),
    ).toEqual(["a", "saved"])
    expect(queryClient.getQueryData(queryKeys.entry.session("a"))).toMatchObject({ starred: true })
  })

  test("unstarring removes the row from saved lists and restores other caches", () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    applyEntryStarState(queryClient, "saved", false)

    expect(
      ids(queryClient.getQueryData<EntryInfiniteData>(queryKeys.entries.saved(false))),
    ).toEqual([])
  })
})
