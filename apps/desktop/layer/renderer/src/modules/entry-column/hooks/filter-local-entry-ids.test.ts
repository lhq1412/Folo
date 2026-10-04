import { describe, expect, it } from "vitest"

import { getVisibleLocalEntryIds } from "./filter-local-entry-ids"

describe("getVisibleLocalEntryIds", () => {
  it("keeps previously visible unread entries when they turn read locally", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-1", "entry-2"],
        entries: {
          "entry-1": { id: "entry-1", read: true },
          "entry-2": { id: "entry-2", read: false },
        },
        stickyVisibleIds: new Set(["entry-1", "entry-2"]),
        unreadOnly: true,
      }),
    ).toEqual(["entry-1", "entry-2"])
  })

  it("filters read entries that were not previously visible", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-1", "entry-2"],
        entries: {
          "entry-1": { id: "entry-1", read: true },
          "entry-2": { id: "entry-2", read: false },
        },
        stickyVisibleIds: new Set<string>(),
        unreadOnly: true,
      }),
    ).toEqual(["entry-2"])
  })

  it("removes sticky entries once they leave the source list", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-2"],
        entries: {
          "entry-1": { id: "entry-1", read: true },
          "entry-2": { id: "entry-2", read: false },
        },
        stickyVisibleIds: new Set(["entry-1", "entry-2"]),
        unreadOnly: true,
      }),
    ).toEqual(["entry-2"])
  })

  it("removes previously visible read entries using the refreshed read snapshot", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-1", "entry-2", "entry-3"],
        entries: {
          "entry-1": { id: "entry-1", read: true },
          "entry-2": { id: "entry-2", read: true },
          "entry-3": { id: "entry-3", read: false },
        },
        stickyVisibleIds: new Set(["entry-1", "entry-2", "entry-3"]),
        excludedReadIds: new Set(["entry-1"]),
        unreadOnly: true,
      }),
    ).toEqual(["entry-2", "entry-3"])
  })

  it("uses the guest snapshot independently of account read flags", () => {
    expect(
      getVisibleLocalEntryIds({
        sourceIds: ["entry-1", "entry-2"],
        entries: {
          "entry-1": { id: "entry-1", read: false },
          "entry-2": { id: "entry-2", read: true },
        },
        excludedReadIds: new Set(["entry-1"]),
        unreadOnly: false,
      }),
    ).toEqual(["entry-2"])
  })
})
