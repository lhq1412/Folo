import type { RefObject } from "react"
import { useCallback, useEffect, useLayoutEffect } from "react"

import {
  captureScroller,
  getTimelineScrollSnapshot,
  restoreScroller,
  saveTimelineScrollSnapshot,
} from "./scroll-restoration"

const PICTURES_REFLOW_MS = 1500

export const useTimelineScrollRestoration = ({
  layoutReady,
  scrollerRef,
  selectedId,
  snapshotKey,
}: {
  layoutReady: boolean
  scrollerRef: RefObject<HTMLElement | null>
  selectedId?: string
  snapshotKey: string
}) => {
  const captureNow = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    saveTimelineScrollSnapshot(snapshotKey, captureScroller(scroller))
  }, [scrollerRef, snapshotKey])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        saveTimelineScrollSnapshot(snapshotKey, captureScroller(scroller))
      })
    }

    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener("scroll", onScroll)
    }
  }, [scrollerRef, snapshotKey])

  useLayoutEffect(() => {
    if (selectedId || !layoutReady) return
    const scroller = scrollerRef.current
    if (!scroller) return

    const snapshot = getTimelineScrollSnapshot(snapshotKey)
    if (snapshot) restoreScroller(scroller, snapshot)
    else scroller.scrollTop = 0

    if (!snapshot?.anchorId || typeof ResizeObserver === "undefined") return

    let cancelled = false
    const observer = new ResizeObserver(() => {
      if (cancelled) return
      const latest = getTimelineScrollSnapshot(snapshotKey)
      if (latest) restoreScroller(scroller, latest)
    })
    observer.observe(scroller)
    const timeoutId = window.setTimeout(() => {
      cancelled = true
      observer.disconnect()
    }, PICTURES_REFLOW_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [layoutReady, scrollerRef, selectedId, snapshotKey])

  return { captureNow }
}
