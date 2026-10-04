import { describe, expect, test } from "vitest"

import { retainVisibleReadEntryIds } from "./retain-visible-read-entry-ids"

describe("retainVisibleReadEntryIds", () => {
  test("keeps missing first and middle read entries before their old successors", () => {
    expect(
      retainVisibleReadEntryIds({
        sourceIds: ["entry-a", "new-entry", "entry-b", "entry-c"],
        previousIds: ["read-first", "entry-a", "read-middle", "entry-b", "entry-c"],
        retainIds: new Set(["read-first", "read-middle"]),
      }),
    ).toEqual(["read-first", "entry-a", "new-entry", "read-middle", "entry-b", "entry-c"])
  })

  test("keeps a missing read tail after its old predecessor and before newly loaded entries", () => {
    expect(
      retainVisibleReadEntryIds({
        sourceIds: ["entry-a", "entry-b", "new-entry-c", "new-entry-d"],
        previousIds: ["entry-a", "entry-b", "read-tail"],
        retainIds: new Set(["read-tail"]),
      }),
    ).toEqual(["entry-a", "entry-b", "read-tail", "new-entry-c", "new-entry-d"])
  })

  test("preserves the order of adjacent missing read entries in the middle and at the tail", () => {
    expect(
      retainVisibleReadEntryIds({
        sourceIds: ["entry-a", "entry-d", "new-entry"],
        previousIds: ["entry-a", "read-b", "read-c", "entry-d", "read-tail-1", "read-tail-2"],
        retainIds: new Set(["read-b", "read-c", "read-tail-1", "read-tail-2"]),
      }),
    ).toEqual(["entry-a", "read-b", "read-c", "entry-d", "read-tail-1", "read-tail-2", "new-entry"])
  })

  test("deduplicates overlapping pages without inserting already returned read entries again", () => {
    expect(
      retainVisibleReadEntryIds({
        sourceIds: ["entry-a", "read-b", "entry-c", "read-b", "read-tail"],
        previousIds: ["entry-a", "read-b", "entry-c", "read-tail"],
        retainIds: new Set(["read-b", "read-tail"]),
      }),
    ).toEqual(["entry-a", "read-b", "entry-c", "read-tail"])
  })

  test("drops ineligible old entries and keeps the source order including new entries", () => {
    const sourceIds = ["new-entry-b", "entry-b", "entry-a", "new-entry-a"]
    const previousIds = ["removed-entry", "read-middle", "entry-a", "entry-b"]

    expect(
      retainVisibleReadEntryIds({
        sourceIds,
        previousIds,
        retainIds: new Set(["read-middle", "never-visible"]),
      }),
    ).toEqual(["new-entry-b", "entry-b", "read-middle", "entry-a", "new-entry-a"])
    expect(sourceIds).toEqual(["new-entry-b", "entry-b", "entry-a", "new-entry-a"])
    expect(previousIds).toEqual(["removed-entry", "read-middle", "entry-a", "entry-b"])
  })

  test("retains only eligible previously visible read entries when the source is empty", () => {
    expect(
      retainVisibleReadEntryIds({
        sourceIds: [],
        previousIds: ["removed-entry", "read-a", "read-b"],
        retainIds: new Set(["read-a", "read-b", "never-visible"]),
      }),
    ).toEqual(["read-a", "read-b"])
  })
})
