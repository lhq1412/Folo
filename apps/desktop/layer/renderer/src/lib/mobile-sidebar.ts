import { isMobile } from "@follow/components/hooks/useMobile.js"

import { setSubscriptionColumnTempShow, setTimelineColumnShow } from "~/atoms/sidebar"

export const MOBILE_SUBSCRIPTION_DRAWER_WIDTH = 280

export const MOBILE_LAYOUT_INIT_KEY = "follow:mobile-layout-initialized"

export function isMobileSubscriptionDrawerOpen(
  feedColumnShow: boolean,
  feedColumnTempShow: boolean,
): boolean {
  return isMobile() && (feedColumnShow || feedColumnTempShow)
}

export function openSubscriptionSidebar() {
  if (isMobile()) {
    setSubscriptionColumnTempShow(true)
    return
  }
  setTimelineColumnShow(true)
}

export function closeSubscriptionSidebar() {
  setSubscriptionColumnTempShow(false)
  if (isMobile()) {
    setTimelineColumnShow(false)
  }
}

export function toggleSubscriptionSidebar(feedColumnShow: boolean, feedColumnTempShow: boolean) {
  if (isMobile()) {
    const isOpen = feedColumnShow || feedColumnTempShow
    if (isOpen) {
      closeSubscriptionSidebar()
    } else {
      openSubscriptionSidebar()
    }
    return
  }
  setTimelineColumnShow(!feedColumnShow)
}
