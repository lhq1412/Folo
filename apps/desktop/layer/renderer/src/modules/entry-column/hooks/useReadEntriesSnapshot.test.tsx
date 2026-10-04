import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import { useReadEntriesSnapshot } from "./useReadEntriesSnapshot"

type SnapshotProps = {
  queryKey: string
  getReadEntryIds: () => ReadonlySet<string>
  page?: number
}

describe("useReadEntriesSnapshot", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null
  let snapshot: ReturnType<typeof useReadEntriesSnapshot> | undefined

  const Consumer = ({ queryKey, getReadEntryIds }: SnapshotProps) => {
    snapshot = useReadEntriesSnapshot(queryKey, getReadEntryIds)
    return null
  }

  const renderSnapshot = async (props: SnapshotProps) => {
    if (!root) {
      container = document.createElement("div")
      document.body.append(container)
      root = createRoot(container)
    }

    await act(async () => {
      root?.render(<Consumer {...props} />)
    })
  }

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }

    container?.remove()
    root = null
    container = null
    snapshot = undefined
  })

  test("copies the initial read ids instead of retaining the live set", async () => {
    const liveReadIds = new Set(["already-read"])

    await renderSnapshot({ queryKey: "articles", getReadEntryIds: () => liveReadIds })

    expect(snapshot?.readEntryIds).toEqual(new Set(["already-read"]))
    expect(snapshot?.readEntryIds).not.toBe(liveReadIds)

    liveReadIds.add("newly-read")
    liveReadIds.delete("already-read")

    expect(snapshot?.readEntryIds).toEqual(new Set(["already-read"]))
  })

  test("keeps the snapshot through live read changes and pagination rerenders", async () => {
    let liveReadIds = new Set(["already-read"])
    const getReadEntryIds = vi.fn(() => liveReadIds)

    await renderSnapshot({ queryKey: "articles", getReadEntryIds, page: 0 })
    const initialSnapshot = snapshot?.readEntryIds
    const initialReadCount = getReadEntryIds.mock.calls.length

    liveReadIds = new Set(["already-read", "newly-read"])
    await renderSnapshot({ queryKey: "articles", getReadEntryIds, page: 1 })
    await renderSnapshot({ queryKey: "articles", getReadEntryIds, page: 1 })

    expect(snapshot?.readEntryIds).toBe(initialSnapshot)
    expect(snapshot?.readEntryIds).toEqual(new Set(["already-read"]))
    expect(getReadEntryIds).toHaveBeenCalledTimes(initialReadCount)
  })

  test("copies the current read ids only when explicitly refreshed", async () => {
    let liveReadIds = new Set(["already-read"])
    const getReadEntryIds = () => liveReadIds

    await renderSnapshot({ queryKey: "articles", getReadEntryIds })
    const initialSnapshot = snapshot?.readEntryIds

    liveReadIds = new Set(["already-read", "newly-read"])
    await act(async () => {
      snapshot?.refreshReadEntryIds()
    })

    expect(snapshot?.readEntryIds).toEqual(new Set(["already-read", "newly-read"]))
    expect(snapshot?.readEntryIds).not.toBe(initialSnapshot)
    expect(snapshot?.readEntryIds).not.toBe(liveReadIds)

    liveReadIds.add("read-after-refresh")
    await renderSnapshot({ queryKey: "articles", getReadEntryIds })

    expect(snapshot?.readEntryIds).toEqual(new Set(["already-read", "newly-read"]))
  })

  test("creates a new snapshot when the timeline query key changes", async () => {
    let liveReadIds = new Set(["first-feed-read"])
    const getReadEntryIds = () => liveReadIds

    await renderSnapshot({ queryKey: "first-feed", getReadEntryIds })
    const firstFeedSnapshot = snapshot?.readEntryIds

    liveReadIds = new Set(["second-feed-read"])
    await renderSnapshot({ queryKey: "second-feed", getReadEntryIds })

    expect(snapshot?.readEntryIds).toEqual(new Set(["second-feed-read"]))
    expect(snapshot?.readEntryIds).not.toBe(firstFeedSnapshot)
    expect(snapshot?.readEntryIds).not.toBe(liveReadIds)

    liveReadIds = new Set(["first-feed-read", "first-feed-read-after-switch"])
    await renderSnapshot({ queryKey: "first-feed", getReadEntryIds })

    expect(snapshot?.readEntryIds).toEqual(
      new Set(["first-feed-read", "first-feed-read-after-switch"]),
    )
    expect(snapshot?.readEntryIds).not.toBe(firstFeedSnapshot)
  })

  test("ignores a delayed refresh callback from the previous query key", async () => {
    let liveReadIds = new Set(["first-feed-read"])
    const getReadEntryIds = () => liveReadIds

    await renderSnapshot({ queryKey: "first-feed", getReadEntryIds })
    const refreshFirstFeed = snapshot!.refreshReadEntryIds
    let resolveFirstFeedRefresh: (() => void) | undefined
    const pendingFirstFeedRefresh = new Promise<void>((resolve) => {
      resolveFirstFeedRefresh = resolve
    }).then(refreshFirstFeed)

    liveReadIds = new Set(["second-feed-read"])
    await renderSnapshot({ queryKey: "second-feed", getReadEntryIds })

    liveReadIds.add("second-feed-read-on-refresh")
    await act(async () => {
      snapshot?.refreshReadEntryIds()
    })
    const secondFeedSnapshot = snapshot?.readEntryIds

    liveReadIds = new Set(["second-feed-read", "second-feed-read-on-refresh", "read-after-switch"])
    await act(async () => {
      resolveFirstFeedRefresh?.()
      await pendingFirstFeedRefresh
    })

    expect(snapshot?.readEntryIds).toBe(secondFeedSnapshot)
    expect(snapshot?.readEntryIds).toEqual(
      new Set(["second-feed-read", "second-feed-read-on-refresh"]),
    )
  })

  test("rejects an old refresh callback after returning to the same query key", async () => {
    let liveReadIds = new Set(["first-feed-read"])
    const getReadEntryIds = () => liveReadIds

    await renderSnapshot({ queryKey: "first-feed", getReadEntryIds })
    const refreshOldFirstFeed = snapshot!.refreshReadEntryIds

    liveReadIds = new Set(["second-feed-read"])
    await renderSnapshot({ queryKey: "second-feed", getReadEntryIds })

    liveReadIds = new Set(["first-feed-read", "read-while-away"])
    await renderSnapshot({ queryKey: "first-feed", getReadEntryIds })

    liveReadIds.add("read-on-new-first-feed")
    await act(async () => {
      expect(snapshot?.refreshReadEntryIds()).toBe(true)
    })
    const currentFirstFeedSnapshot = snapshot?.readEntryIds

    liveReadIds.add("read-after-current-refresh")
    await act(async () => {
      expect(refreshOldFirstFeed()).toBe(false)
    })

    expect(snapshot?.readEntryIds).toBe(currentFirstFeedSnapshot)
    expect(snapshot?.readEntryIds).toEqual(
      new Set(["first-feed-read", "read-while-away", "read-on-new-first-feed"]),
    )
  })
})
