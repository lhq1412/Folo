import { FeedViewType } from "@follow-app/client-sdk"

import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"
import { getNextPageParam, PAGE_SIZE } from "./model"

export const fetchTimelinePage = ({
  pageParam,
  unreadOnly,
  view,
}: {
  pageParam: string | undefined
  unreadOnly: boolean
  view: FeedViewType
}) =>
  followApi.entries.list({
    limit: PAGE_SIZE,
    publishedAfter: pageParam,
    read: unreadOnly ? false : undefined,
    view,
    withContent: view === FeedViewType.SocialMedia,
  })

export const timelineInfiniteQueryOptions = (view: FeedViewType, unreadOnly: boolean) => ({
  queryKey: queryKeys.entries.list(view, unreadOnly),
  queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
    fetchTimelinePage({ pageParam, unreadOnly, view }),
  initialPageParam: undefined as string | undefined,
  getNextPageParam,
})
