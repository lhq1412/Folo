import { cn } from "@follow/utils/utils"
import type { FC } from "react"

interface MobileSubscriptionDrawerBackdropProps {
  open: boolean
  onClose: () => void
}

export const MobileSubscriptionDrawerBackdrop: FC<MobileSubscriptionDrawerBackdropProps> = ({
  open,
  onClose,
}) => {
  if (!open) {
    return null
  }

  return (
    <div
      aria-hidden="true"
      className={cn("fixed inset-0 z-[11] bg-black/40", "duration-200 animate-in fade-in-0")}
      onClick={onClose}
    />
  )
}
