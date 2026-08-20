// @vitest-environment jsdom

import { describe, expect, test } from "vitest"

import {
  captureScroller,
  clearTimelineScrollSnapshots,
  getTimelineScrollSnapshot,
  restoreScroller,
  saveTimelineScrollSnapshot,
  timelineScrollKey,
} from "./scroll-restoration"

describe("timeline scroll restoration", () => {
  test("keys snapshots by view and unread filter without using localStorage", () => {
    expect(timelineScrollKey("articles", false)).toBe("articles:all")
    expect(timelineScrollKey("pictures", true)).toBe("pictures:unread")
    saveTimelineScrollSnapshot("articles:all", {
      anchorId: "entry-1",
      anchorOffset: 12,
      scrollTop: 480,
    })
    expect(getTimelineScrollSnapshot("articles:all")).toEqual({
      anchorId: "entry-1",
      anchorOffset: 12,
      scrollTop: 480,
    })
    clearTimelineScrollSnapshots()
    expect(getTimelineScrollSnapshot("articles:all")).toBeUndefined()
  })
})

describe("scroller capture and restore", () => {
  test("restores an item anchor and offset instead of only raw scrollTop", () => {
    const scroller = document.createElement("div")
    const first = document.createElement("div")
    const second = document.createElement("div")
    first.dataset.entryId = "one"
    second.dataset.entryId = "two"
    scroller.append(first, second)
    document.body.append(scroller)

    scroller.getBoundingClientRect = () => ({
      bottom: 400,
      height: 400,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON() {},
    })
    first.getBoundingClientRect = () => ({
      bottom: -40,
      height: 80,
      left: 0,
      right: 300,
      top: -120,
      width: 300,
      x: 0,
      y: -120,
      toJSON() {},
    })
    second.getBoundingClientRect = () => ({
      bottom: 80,
      height: 80,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON() {},
    })
    Object.defineProperty(scroller, "scrollTop", { configurable: true, value: 240, writable: true })

    const snapshot = captureScroller(scroller)
    expect(snapshot).toEqual({ anchorId: "two", anchorOffset: 0, scrollTop: 240 })

    second.getBoundingClientRect = () => ({
      bottom: 140,
      height: 80,
      left: 0,
      right: 300,
      top: 60,
      width: 300,
      x: 0,
      y: 60,
      toJSON() {},
    })
    restoreScroller(scroller, snapshot)
    expect(scroller.scrollTop).toBe(300)

    scroller.remove()
  })
})
