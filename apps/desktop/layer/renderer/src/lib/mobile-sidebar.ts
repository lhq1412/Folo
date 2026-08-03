import { isMobile } from "@follow/components/hooks/useMobile.js"

import { setSubscriptionColumnTempShow, setTimelineColumnShow } from "~/atoms/sidebar"

export const MOBILE_SUBSCRIPTION_DRAWER_ID = "mobile-subscription-drawer"

export const MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID =
  "mobile-subscription-drawer-entry-trigger"

export const MOBILE_SUBSCRIPTION_DRAWER_HEADER_TRIGGER_ID =
  "mobile-subscription-drawer-header-trigger"

export type MobileSubscriptionDrawerOpenerId =
  | typeof MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID
  | typeof MOBILE_SUBSCRIPTION_DRAWER_HEADER_TRIGGER_ID

export const MOBILE_SUBSCRIPTION_DRAWER_TRANSITION_MS = 200

export const MOBILE_LAYOUT_INIT_KEY = "follow:mobile-layout-initialized"

let subscriptionDrawerOpenerId: MobileSubscriptionDrawerOpenerId | null = null

export function getSubscriptionDrawerOpenerId() {
  return subscriptionDrawerOpenerId
}

export function setSubscriptionDrawerOpener(openerId: MobileSubscriptionDrawerOpenerId) {
  subscriptionDrawerOpenerId = openerId
}

export function focusSubscriptionDrawerOpener(
  openerId: MobileSubscriptionDrawerOpenerId | null = subscriptionDrawerOpenerId,
) {
  if (!openerId) {
    return false
  }

  const element = document.getElementById(openerId)
  if (!(element instanceof HTMLElement)) {
    return false
  }

  element.focus()
  return true
}

export function isMobileSubscriptionDrawerOpen(
  feedColumnShow: boolean,
  feedColumnTempShow: boolean,
): boolean {
  return isMobile() && (feedColumnShow || feedColumnTempShow)
}

export function openSubscriptionSidebar(openerId?: MobileSubscriptionDrawerOpenerId) {
  if (openerId) {
    setSubscriptionDrawerOpener(openerId)
  } else if (
    document.activeElement instanceof HTMLElement &&
    document.activeElement.id &&
    (document.activeElement.id === MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID ||
      document.activeElement.id === MOBILE_SUBSCRIPTION_DRAWER_HEADER_TRIGGER_ID)
  ) {
    setSubscriptionDrawerOpener(document.activeElement.id as MobileSubscriptionDrawerOpenerId)
  }

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
