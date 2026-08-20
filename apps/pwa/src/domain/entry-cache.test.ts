import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import type { EntryListItem } from "./entry"
import {
  findEntryInInfiniteData,
  mapEntriesInInfiniteData,
  prependEntryInInfiniteData,
} from "./entry-cache"

const item = (id: string, read = false): EntryListItem =>
  ({
    entries: { id, publishedAt: "2026-08-01T00:00:00.000Z" },
    feeds: { id: "feed-1" },
    from: [],
    read,
    view: FeedViewType.Articles,
  }) as unknown as EntryListItem

describe("entry infinite cache helpers", () => {
  const data = {
    pageParams: [undefined, "cursor-1"],
    pages: [{ data: [item("a"), item("b")] }, { data: [item("c"), item("d")] }],
  }

  test("finds an entry across pages", () => {
    expect(findEntryInInfiniteData(data, "c")?.entries.id).toBe("c")
    expect(findEntryInInfiniteData(data, "missing")).toBeUndefined()
  })

  test("patches an item in a later page without cloning unchanged pages", () => {
    const next = mapEntriesInInfiniteData(data, (entry) =>
      entry.entries.id === "c" ? { ...entry, read: true } : entry,
    )
    expect(next).not.toBe(data)
    expect(next?.pages[0]).toBe(data.pages[0])
    expect(next?.pages[1]).not.toBe(data.pages[1])
    expect(next?.pages[1]?.data[0]?.read).toBe(true)
    expect(next?.pageParams).toBe(data.pageParams)
  })

  test("removes an item when the mapper returns null", () => {
    const next = mapEntriesInInfiniteData(data, (entry) =>
      entry.entries.id === "b" ? null : entry,
    )
    expect(next?.pages[0]?.data.map((entry) => entry.entries.id)).toEqual(["a"])
    expect(next?.pages[1]?.data.map((entry) => entry.entries.id)).toEqual(["c", "d"])
  })

  test("returns the same object when nothing changes", () => {
    expect(mapEntriesInInfiniteData(data, (entry) => entry)).toBe(data)
  })

  test("prepends onto the first page and keeps later pages", () => {
    const next = prependEntryInInfiniteData(data, item("z"))
    expect(next.pages[0]?.data.map((entry) => entry.entries.id)).toEqual(["z", "a", "b"])
    expect(next.pages[1]).toBe(data.pages[1])
  })
})
