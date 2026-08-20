export type TimelineScrollSnapshot = {
  scrollTop: number
  anchorId: string | null
  anchorOffset: number
}

const snapshots = new Map<string, TimelineScrollSnapshot>()

export const timelineScrollKey = (viewSlug: string, unreadOnly: boolean) =>
  `${viewSlug}:${unreadOnly ? "unread" : "all"}`

export const saveTimelineScrollSnapshot = (key: string, snapshot: TimelineScrollSnapshot) => {
  snapshots.set(key, snapshot)
}

export const getTimelineScrollSnapshot = (key: string) => snapshots.get(key)

export const clearTimelineScrollSnapshots = () => {
  snapshots.clear()
}

const escapeAttr = (value: string) =>
  typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value

export const captureScroller = (scroller: HTMLElement): TimelineScrollSnapshot => {
  const scrollerRect = scroller.getBoundingClientRect()
  const items = scroller.querySelectorAll<HTMLElement>("[data-entry-id]")
  let anchorId: string | null = null
  let anchorOffset = 0

  for (const item of items) {
    const itemRect = item.getBoundingClientRect()
    if (itemRect.bottom > scrollerRect.top + 8) {
      anchorId = item.dataset.entryId ?? null
      anchorOffset = itemRect.top - scrollerRect.top
      break
    }
  }

  return { anchorId, anchorOffset, scrollTop: scroller.scrollTop }
}

export const restoreScroller = (scroller: HTMLElement, snapshot: TimelineScrollSnapshot) => {
  if (snapshot.anchorId) {
    const item = scroller.querySelector<HTMLElement>(
      `[data-entry-id="${escapeAttr(snapshot.anchorId)}"]`,
    )
    if (item) {
      const delta =
        item.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        snapshot.anchorOffset
      scroller.scrollTop += delta
      return
    }
  }

  scroller.scrollTop = snapshot.scrollTop
}
