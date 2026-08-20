import type { EntryListResponse } from "@follow-app/client-sdk"
import { FeedViewType } from "@follow-app/client-sdk"

import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"
import {
  getNextPageParam,
  getSavedNextPageParam,
  PAGE_SIZE,
  TIMELINE_GC_TIME_MS,
  TIMELINE_STALE_TIME_MS,
} from "./model"

const listQueryDefaults = {
  gcTime: TIMELINE_GC_TIME_MS,
  initialPageParam: undefined as string | undefined,
  refetchOnMount: false as const,
  staleTime: TIMELINE_STALE_TIME_MS,
}

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

export const fetchSavedPage = ({
  pageParam,
  unreadOnly,
}: {
  pageParam: string | undefined
  unreadOnly: boolean
}) =>
  followApi.entries.list({
    isCollection: true,
    limit: PAGE_SIZE,
    publishedAfter: pageParam,
    read: unreadOnly ? false : undefined,
    withContent: true,
  })

export const timelineInfiniteQueryOptions = (view: FeedViewType, unreadOnly: boolean) => ({
  ...listQueryDefaults,
  getNextPageParam: getNextPageParam as (page: EntryListResponse) => string | undefined,
  queryFn: ({ pageParam }: { pageParam: string | undefined }): Promise<EntryListResponse> =>
    fetchTimelinePage({ pageParam, unreadOnly, view }),
  queryKey: queryKeys.entries.timeline(view, unreadOnly),
})

export const savedInfiniteQueryOptions = (unreadOnly: boolean) => ({
  ...listQueryDefaults,
  getNextPageParam: getSavedNextPageParam as (page: EntryListResponse) => string | undefined,
  queryFn: ({ pageParam }: { pageParam: string | undefined }): Promise<EntryListResponse> =>
    fetchSavedPage({ pageParam, unreadOnly }),
  queryKey: queryKeys.entries.saved(unreadOnly),
})
