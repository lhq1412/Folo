import { FeedViewType } from "@follow-app/client-sdk"
import { describe, expect, test } from "vitest"

import type { EntryListItem } from "./entry"
import { entryIdOf, entrySessionFromListItem, isInboxEntry, isStarred } from "./entry"

const item = {
  collections: { createdAt: "2026-08-01T00:00:00.000Z" },
  entries: { id: "entry-1" },
  feeds: { id: "inbox-1", type: "inbox" },
  from: [],
  read: false,
  view: FeedViewType.Articles,
} as unknown as EntryListItem

describe("entry helpers", () => {
  test("reads identity, inbox, and starred flags from a list item", () => {
    expect(entryIdOf(item)).toBe("entry-1")
    expect(isInboxEntry(item)).toBe(true)
    expect(isStarred(item)).toBe(true)
    expect(isStarred({ collections: undefined })).toBe(false)
  })

  test("builds an entry session from a list item", () => {
    expect(entrySessionFromListItem(item)).toMatchObject({
      id: "entry-1",
      isInbox: true,
      read: false,
      starred: true,
      view: FeedViewType.Articles,
    })
  })
})
