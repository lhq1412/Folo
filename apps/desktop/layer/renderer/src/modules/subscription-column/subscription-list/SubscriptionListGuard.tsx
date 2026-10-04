import type { FeedViewType } from "@follow/constants"
import { useIsLoggedIn } from "@follow/store/user/hooks"
import { cn } from "@follow/utils"

import { GuestFeedList } from "./GuestFeedList"
import { SubscriptionList as FeedListDesktop } from "./SubscriptionList"

export const SubscriptionListGuard = function SubscriptionListGuard(props: SubscriptionProps) {
  const { ref, className, view, isSubscriptionLoading } = props
  const isLoggedIn = useIsLoggedIn()

  if (typeof view !== "number") {
    return null
  }
  if (!isLoggedIn) {
    return (
      <GuestFeedList className={cn("flex size-full flex-col text-sm", className)} view={view} />
    )
  }
  return (
    <FeedListDesktop
      className={cn("flex size-full flex-col text-sm", className)}
      view={view}
      ref={ref}
      isSubscriptionLoading={isSubscriptionLoading}
    />
  )
}

export type SubscriptionProps = ComponentType<
  { className?: string; view: FeedViewType; isSubscriptionLoading: boolean } & {
    ref?: React.Ref<HTMLDivElement | null> | ((node: HTMLDivElement | null) => void)
  }
>
