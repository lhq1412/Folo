import { ScrollArea } from "@follow/components/ui/scroll-area/index.js"
import { FeedViewType } from "@follow/constants"
import { cn } from "@follow/utils"
import { useTranslation } from "react-i18next"

import { GUEST_FEEDS } from "~/constants/guest-feeds"
import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { useRouteParams } from "~/hooks/biz/useRouteParams"

import { feedColumnStyles } from "../styles"

export const GuestFeedList = ({ className, view }: { className?: string; view: FeedViewType }) => {
  const { t } = useTranslation()
  const navigate = useNavigateEntry()
  const { feedId } = useRouteParams()

  return (
    <ScrollArea.ScrollArea rootClassName={className} viewportClassName="px-2" flex>
      <p className="px-2.5 py-3 text-xs leading-relaxed text-text-secondary">
        {t("guest_feed_list.description")}
      </p>
      {(view === FeedViewType.Articles || view === FeedViewType.All) &&
        GUEST_FEEDS.map((feed) => (
          <button
            key={feed.id}
            type="button"
            data-feed-id={feed.id}
            data-active={feedId === feed.id}
            className={cn(feedColumnStyles.item, "min-h-[44px] gap-2 px-2.5 text-left")}
            onClick={(event) => {
              event.stopPropagation()
              navigate({ feedId: feed.id, entryId: null, view: FeedViewType.Articles })
            }}
          >
            <i className="i-mgc-rss-cute-fi shrink-0 text-text-secondary" />
            <span className="truncate">{feed.title}</span>
          </button>
        ))}
    </ScrollArea.ScrollArea>
  )
}
