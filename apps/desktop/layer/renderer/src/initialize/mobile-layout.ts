import { isMobile } from "@follow/components/hooks/useMobile.js"
import { WEB_BUILD } from "@follow/shared/constants"

import { setTimelineColumnShow } from "~/atoms/sidebar"
import { MOBILE_LAYOUT_INIT_KEY } from "~/lib/mobile-sidebar"

export function initializeMobileLayout() {
  if (!WEB_BUILD || !isMobile()) {
    return
  }

  if (localStorage.getItem(MOBILE_LAYOUT_INIT_KEY)) {
    return
  }

  setTimelineColumnShow(false)
  localStorage.setItem(MOBILE_LAYOUT_INIT_KEY, "1")
}
