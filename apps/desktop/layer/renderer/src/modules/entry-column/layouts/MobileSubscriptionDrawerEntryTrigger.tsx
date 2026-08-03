import type { FC } from "react"
import { useEffect, useRef } from "react"

import {
  MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID,
  MOBILE_SUBSCRIPTION_DRAWER_ID,
  openSubscriptionSidebar,
} from "~/lib/mobile-sidebar"

export const MobileSubscriptionDrawerEntryTrigger: FC<{
  label: string
}> = ({ label }) => {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const button = buttonRef.current
    if (!button) {
      return
    }

    const handleClick = () => {
      openSubscriptionSidebar(MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID)
    }

    button.addEventListener("click", handleClick)
    return () => {
      button.removeEventListener("click", handleClick)
    }
  }, [])

  return (
    <button
      ref={buttonRef}
      id={MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID}
      data-testid={MOBILE_SUBSCRIPTION_DRAWER_ENTRY_TRIGGER_ID}
      type="button"
      aria-label={label}
      aria-expanded={false}
      aria-controls={MOBILE_SUBSCRIPTION_DRAWER_ID}
      className="no-drag-region pointer-events-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-xl duration-200 hover:bg-theme-item-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2"
    >
      <i className="i-mgc-layout-leftbar-open-cute-re pointer-events-none text-text-secondary" />
    </button>
  )
}
