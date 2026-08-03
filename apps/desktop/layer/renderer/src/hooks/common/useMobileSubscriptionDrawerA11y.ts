import type { RefObject } from "react"
import { useEffect, useLayoutEffect, useRef } from "react"

import {
  consumeSubscriptionDrawerOpener,
  focusSubscriptionDrawerOpener,
} from "~/lib/mobile-sidebar"

import {
  getFocusableElements,
  handleMobileDrawerFocusTrapKeyDown,
} from "./mobile-subscription-drawer-focus-trap"

const FOCUS_RESTORE_MAX_ATTEMPTS = 10

export function useMobileSubscriptionDrawerA11y({
  open,
  onClose,
  drawerRef,
}: {
  open: boolean
  onClose: () => void
  drawerRef: RefObject<HTMLElement | null>
}) {
  useEffect(() => {
    if (!open) {
      return
    }

    const drawer = drawerRef.current
    const focusableElements = drawer ? getFocusableElements(drawer) : []
    focusableElements[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!drawer) {
        return
      }

      if (
        handleMobileDrawerFocusTrapKeyDown(event, drawer, document.activeElement, () => {
          event.preventDefault()
          onClose()
        })
      ) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
    }

    document.addEventListener("keydown", handleKeyDown, true)

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [drawerRef, onClose, open])

  const wasOpenRef = useRef(open)

  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open

    if (!wasOpen || open) {
      return
    }

    const openerId = consumeSubscriptionDrawerOpener()
    if (!openerId) {
      return
    }

    let frameId = 0
    let attempts = 0

    const restoreFocus = () => {
      if (focusSubscriptionDrawerOpener(openerId) || attempts >= FOCUS_RESTORE_MAX_ATTEMPTS) {
        return
      }

      attempts += 1
      frameId = requestAnimationFrame(restoreFocus)
    }

    frameId = requestAnimationFrame(restoreFocus)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [open])
}

export function useMobileSubscriptionDrawerInert({
  open,
  enabled,
}: {
  open: boolean
  enabled: boolean
}) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const main = document.querySelector("main")
    if (!main) {
      return
    }

    if (open) {
      main.setAttribute("inert", "")
      main.setAttribute("aria-hidden", "true")
    } else {
      main.removeAttribute("inert")
      main.removeAttribute("aria-hidden")
    }

    return () => {
      main.removeAttribute("inert")
      main.removeAttribute("aria-hidden")
    }
  }, [enabled, open])
}
