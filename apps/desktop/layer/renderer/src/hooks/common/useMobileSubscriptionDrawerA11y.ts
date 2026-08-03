import type { RefObject } from "react"
import { useEffect, useRef } from "react"

import { getSubscriptionDrawerTrigger } from "~/lib/mobile-sidebar"

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
  )
}

export function useMobileSubscriptionDrawerA11y({
  open,
  onClose,
  drawerRef,
}: {
  open: boolean
  onClose: () => void
  drawerRef: RefObject<HTMLElement | null>
}) {
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    restoreFocusRef.current = getSubscriptionDrawerTrigger()

    const drawer = drawerRef.current
    const focusableElements = drawer ? getFocusableElements(drawer) : []
    focusableElements[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== "Tab" || !drawer) {
        return
      }

      const elements = getFocusableElements(drawer)
      if (elements.length === 0) {
        event.preventDefault()
        return
      }

      const first = elements[0]
      const last = elements.at(-1)
      if (!first || !last) {
        return
      }

      const activeElement = document.activeElement
      if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)

      const restoreTarget = restoreFocusRef.current
      if (restoreTarget?.isConnected) {
        restoreTarget.focus()
      }
    }
  }, [drawerRef, onClose, open])
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
