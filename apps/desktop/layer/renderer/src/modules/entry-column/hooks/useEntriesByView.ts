import { FeedViewType, getView } from "@follow/constants"
import { useCollectionEntryList } from "@follow/store/collection/hooks"
import { isOnboardingEntryUrl } from "@follow/store/constants/onboarding"
import {
  useEntriesQuery,
  useEntryIdsByFeedId,
  useEntryIdsByFeedIds,
  useEntryIdsByInboxId,
  useEntryIdsByListId,
  useEntryIdsByView,
} from "@follow/store/entry/hooks"
import { entryActions, entrySyncServices, useEntryStore } from "@follow/store/entry/store"
import type { UseEntriesReturn } from "@follow/store/entry/types"
import { fallbackReturn } from "@follow/store/entry/utils"
import { getSubscriptionByEntryId } from "@follow/store/subscription/getter"
import { useFolderFeedsByFeedId } from "@follow/store/subscription/hooks"
import { useSubscriptionStore } from "@follow/store/subscription/store"
import { unreadSyncService } from "@follow/store/unread/store"
import { useIsLoggedIn } from "@follow/store/user/hooks"
import { nextFrame } from "@follow/utils"
import { isBizId } from "@follow/utils/utils"
import { useMutation } from "@tanstack/react-query"
import { debounce } from "es-toolkit/compat"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getGuestReadEntryIds } from "~/atoms/guest-read"
import { useGeneralSettingKey } from "~/atoms/settings/general"
import { ROUTE_FEED_PENDING } from "~/constants/app"
import { GUEST_FEED_IDS } from "~/constants/guest-feeds"
import { useFeature } from "~/hooks/biz/useFeature"
import { useRouteParams } from "~/hooks/biz/useRouteParams"

import { aiTimelineEnabledAtom } from "../atoms/ai-timeline"
import { getVisibleLocalEntryIds } from "./filter-local-entry-ids"
import { retainVisibleReadEntryIds } from "./retain-visible-read-entry-ids"
import { useIsPreviewFeed } from "./useIsPreviewFeed"
import { useReadEntriesSnapshot } from "./useReadEntriesSnapshot"

const useRemoteEntries = (onRefetchSuccess: () => void): UseEntriesReturn => {
  const { feedId, view, inboxId, listId } = useRouteParams()
  const isPreview = useIsPreviewFeed()
  const isLoggedIn = useIsLoggedIn()

  const unreadOnly = useGeneralSettingKey("unreadOnly")
  const hidePrivateSubscriptionsInTimeline = useGeneralSettingKey(
    "hidePrivateSubscriptionsInTimeline",
  )
  const aiTimelineEnabled = useAtomValue(aiTimelineEnabledAtom)
  const aiEnabled = useFeature("ai")

  const folderIds = useFolderFeedsByFeedId({
    feedId,
    view,
  })

  const entriesOptions = useMemo(() => {
    const params = {
      feedId: folderIds?.join(",") || feedId,
      inboxId,
      listId,
      view,
      ...(!isLoggedIn &&
        (!feedId || feedId === ROUTE_FEED_PENDING) &&
        !inboxId &&
        !listId &&
        (view === FeedViewType.Articles || view === FeedViewType.All) && {
          feedIdList: GUEST_FEED_IDS,
        }),
      ...(isLoggedIn && unreadOnly === true && !isPreview && { unreadOnly: true }),
      ...(isLoggedIn &&
        hidePrivateSubscriptionsInTimeline === true && {
          hidePrivateSubscriptionsInTimeline: true,
        }),
      ...(view === FeedViewType.All && { limit: 40 }),
      ...(isLoggedIn && aiTimelineEnabled && aiEnabled && { aiSort: true }),
    }

    if (feedId && listId && isBizId(feedId)) {
      delete params.listId
    }

    return params
  }, [
    feedId,
    folderIds,
    inboxId,
    listId,
    unreadOnly,
    isPreview,
    isLoggedIn,
    view,
    hidePrivateSubscriptionsInTimeline,
    aiTimelineEnabled,
    aiEnabled,
  ])
  const query = useEntriesQuery(entriesOptions)
  const entriesIds = useMemo(() => {
    if (!query.isError) return query.entriesIds
    // A failed refresh must keep the last successful page, including public feeds without subscriptions.
    return (
      query.data?.pages
        .flatMap((page) => page.data?.map((entry) => entry.entries.id))
        .filter((id) => typeof id === "string") ?? []
    )
  }, [query.data, query.entriesIds, query.isError])

  const [fetchedTime, setFetchedTime] = useState<number>()
  useEffect(() => {
    if (!query.isFetching) {
      setFetchedTime(Date.now())
    }
  }, [query.isFetching])

  const refetch = useCallback(async () => {
    const result = await query.refetch()
    if (result.isSuccess && !result.isFetching) onRefetchSuccess()
  }, [query, onRefetchSuccess])
  const fetchNextPage = useCallback(async () => void query.fetchNextPage(), [query])

  if (!query.data || query.isLoading) {
    return {
      ...fallbackReturn,
      refetch,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      error: query.isError ? query.error : null,
      queryKey: query.queryKey,
    }
  }
  return {
    entriesIds,
    hasNext: query.hasNextPage,
    refetch,

    fetchNextPage,
    isLoading: query.isFetching,
    isRefetching: query.isRefetching,
    isReady: query.isSuccess || !!query.data,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetching: query.isFetching,
    hasNextPage: query.hasNextPage,
    error: query.isError ? query.error : null,
    fetchedTime,
    queryKey: query.queryKey,
  }
}

function getEntryIdsFromMultiplePlace(...entryIds: Array<string[] | undefined | null>) {
  return entryIds.find((ids) => ids?.length) ?? []
}

const useLocalEntries = (
  unreadOnly: boolean,
  excludedReadIds: ReadonlySet<string>,
): UseEntriesReturn & { allEntriesIds: string[] } => {
  const { feedId, view, inboxId, listId, isCollection } = useRouteParams()
  const hidePrivateSubscriptionsInTimeline = useGeneralSettingKey(
    "hidePrivateSubscriptionsInTimeline",
  )

  const folderIds = useFolderFeedsByFeedId({
    feedId,
    view,
  })
  const entryIdsByView = useEntryIdsByView(view, hidePrivateSubscriptionsInTimeline)
  const entryIdsByCollections = useCollectionEntryList(view)
  const entryIdsByFeedId = useEntryIdsByFeedId(feedId)
  const entryIdsByCategory = useEntryIdsByFeedIds(folderIds)
  const entryIdsByListId = useEntryIdsByListId(listId)
  const entryIdsByInboxId = useEntryIdsByInboxId(inboxId)

  const showEntriesByView =
    (!feedId || feedId === ROUTE_FEED_PENDING) &&
    folderIds.length === 0 &&
    !isCollection &&
    !inboxId &&
    !listId

  const localQueryKey = useMemo(
    () => [feedId || "", view, inboxId || "", listId || "", isCollection ? "1" : "0"].join(":"),
    [feedId, inboxId, isCollection, listId, view],
  )
  const stickyVisibleStateRef = useRef<{
    queryKey: string
    ids: Set<string>
  }>({
    queryKey: localQueryKey,
    ids: new Set<string>(),
  })

  const allEntries = useEntryStore(
    useCallback(
      (state) => {
        const ids = isCollection
          ? entryIdsByCollections
          : showEntriesByView
            ? (entryIdsByView ?? [])
            : (getEntryIdsFromMultiplePlace(
                entryIdsByFeedId,
                entryIdsByCategory,
                entryIdsByListId,
                entryIdsByInboxId,
              ) ?? [])

        const stickyVisibleIds =
          unreadOnly && stickyVisibleStateRef.current.queryKey === localQueryKey
            ? stickyVisibleStateRef.current.ids
            : undefined

        return getVisibleLocalEntryIds({
          sourceIds: ids,
          entries: state.data,
          stickyVisibleIds,
          excludedReadIds,
          unreadOnly,
        })
      },
      [
        entryIdsByCategory,
        entryIdsByCollections,
        entryIdsByFeedId,
        entryIdsByInboxId,
        entryIdsByListId,
        entryIdsByView,
        excludedReadIds,
        isCollection,
        localQueryKey,
        showEntriesByView,
        unreadOnly,
      ],
    ),
  )

  useEffect(() => {
    stickyVisibleStateRef.current = {
      queryKey: localQueryKey,
      ids: unreadOnly ? new Set(allEntries) : new Set<string>(),
    }
  }, [allEntries, localQueryKey, unreadOnly])

  const [page, setPage] = useState(0)
  const pageSize = 30
  const totalPage = useMemo(
    () => (allEntries ? Math.ceil(allEntries.length / pageSize) : 0),
    [allEntries],
  )

  const entries = useMemo(() => {
    return allEntries?.slice(0, (page + 1) * pageSize) || []
  }, [allEntries, page, pageSize])

  const hasNext = useMemo(() => {
    return entries.length < (allEntries?.length || 0)
  }, [entries.length, allEntries])

  const refetch = useCallback(async () => {
    setPage(0)
  }, [])

  const fetchNextPage = useCallback(
    debounce(async () => {
      setPage(page + 1)
    }, 300),
    [page],
  )

  useEffect(() => {
    setPage(0)
  }, [view, feedId])

  return {
    allEntriesIds: allEntries,
    entriesIds: entries,
    hasNext,
    refetch,
    fetchNextPage: fetchNextPage as () => Promise<void>,
    isLoading: false,
    isRefetching: false,
    isReady: true,
    isFetchingNextPage: false,
    isFetching: false,
    hasNextPage: page < totalPage,
    error: null,
  }
}

export const useEntriesByView = ({ onReset }: { onReset?: () => void }) => {
  const { feedId, view, inboxId, listId, isCollection } = useRouteParams()
  const isLoggedIn = useIsLoggedIn()
  const unreadOnly = useGeneralSettingKey("unreadOnly")
  const subscriptions = useSubscriptionStore((state) => state.data)
  const hidePrivateSubscriptionsInTimeline = useGeneralSettingKey(
    "hidePrivateSubscriptionsInTimeline",
  )
  const isPreview = useIsPreviewFeed()
  const filterRead = isLoggedIn && unreadOnly && !isPreview && !isCollection
  const timelineKey = JSON.stringify([
    feedId,
    view,
    inboxId,
    listId,
    isCollection,
    isLoggedIn,
    filterRead,
  ])
  const getReadEntryIds = useCallback((): ReadonlySet<string> => {
    if (!isLoggedIn) return getGuestReadEntryIds()
    if (!filterRead) return new Set<string>()
    return new Set(
      Object.values(entryActions.getFlattenMapEntries())
        .filter((entry) => entry.read)
        .map((entry) => entry.id),
    )
  }, [filterRead, isLoggedIn])
  const { readEntryIds, refreshReadEntryIds } = useReadEntriesSnapshot(timelineKey, getReadEntryIds)

  const localQuery = useLocalEntries(filterRead, readEntryIds)
  const { refetch: refetchLocalEntries, allEntriesIds } = localQuery
  const onRefetchSuccess = useCallback(() => {
    if (refreshReadEntryIds()) void refetchLocalEntries()
  }, [refreshReadEntryIds, refetchLocalEntries])
  const remoteQuery = useRemoteEntries(onRefetchSuccess)

  useFetchEntryContentByStream(remoteQuery.entriesIds)

  // If remote data is not available, we use the local data, get the local data length
  // FIXME: remote first, then local store data
  // NOTE: We still can't use the store's data handling directly.
  // Imagine that the local data may be persistent, and then if there are incremental updates to the data on the server side,
  // then we have no way to incrementally update the data.
  // We need to add an interface to incrementally update the data based on the version hash.

  const query = remoteQuery.isReady ? remoteQuery : localQuery
  const remoteQueryKey = JSON.stringify(remoteQuery.queryKey)
  const visibleEntriesRef = useRef<{
    readEntryIds: ReadonlySet<string>
    queryKey: string | undefined
    ids: string[]
  } | null>(null)
  const entryIds = useMemo(() => {
    const sourceIds = query.entriesIds.filter((id) => !readEntryIds.has(id))
    const previous = visibleEntriesRef.current
    if (
      !filterRead ||
      previous?.readEntryIds !== readEntryIds ||
      previous.queryKey !== remoteQueryKey
    ) {
      return sourceIds
    }

    const entries = entryActions.getFlattenMapEntries()
    const localVisibleIds = new Set(allEntriesIds)
    const isAggregateTimeline = (!feedId || feedId === ROUTE_FEED_PENDING) && !inboxId && !listId
    const hiddenSubscriptions = new Set(
      Object.values(subscriptions).filter(
        (subscription) =>
          subscription.hideFromTimeline ||
          (hidePrivateSubscriptionsInTimeline && subscription.isPrivate),
      ),
    )
    const retainIds = new Set(
      previous.ids.filter((id) => {
        if (!entries[id]?.read || readEntryIds.has(id) || !localVisibleIds.has(id)) return false
        if (isAggregateTimeline) {
          const subscription = getSubscriptionByEntryId(id)
          if (subscription && hiddenSubscriptions.has(subscription)) {
            return false
          }
        }
        return true
      }),
    )
    return retainVisibleReadEntryIds({ sourceIds, previousIds: previous.ids, retainIds })
  }, [
    query.entriesIds,
    readEntryIds,
    filterRead,
    remoteQueryKey,
    allEntriesIds,
    feedId,
    inboxId,
    listId,
    hidePrivateSubscriptionsInTimeline,
    subscriptions,
  ])

  useEffect(() => {
    visibleEntriesRef.current = { readEntryIds, queryKey: remoteQueryKey, ids: entryIds }
  }, [readEntryIds, remoteQueryKey, entryIds])

  useEffect(() => {
    if (query.entriesIds.length && !entryIds.length && query.hasNextPage && !query.isFetching) {
      void query.fetchNextPage()
    }
  }, [entryIds.length, query])

  const isFetchingFirstPage = remoteQuery.isFetching && !remoteQuery.isFetchingNextPage

  useEffect(() => {
    if (isFetchingFirstPage) {
      nextFrame(() => {
        onReset?.()
      })
    }
  }, [isFetchingFirstPage, query.queryKey])

  const groupByDate = useGeneralSettingKey("groupByDate")
  const groupedCounts: number[] | undefined = useMemo(() => {
    const viewDefinition = getView(view)
    if (viewDefinition?.gridMode || view === FeedViewType.All) {
      return
    }
    if (!groupByDate) {
      return
    }
    const entriesId2Map = entryActions.getFlattenMapEntries()
    const counts = [] as number[]
    let lastDate = ""
    for (const id of entryIds) {
      const entry = entriesId2Map[id]
      if (!entry) {
        continue
      }
      if (isOnboardingEntryUrl(entry.url)) {
        continue
      }
      const date = new Date(listId ? entry.insertedAt : entry.publishedAt).toDateString()
      if (date !== lastDate) {
        counts.push(1)
        lastDate = date
      } else {
        const last = counts.pop()
        if (last) counts.push(last + 1)
      }
    }

    return counts
  }, [groupByDate, listId, entryIds, view])

  return {
    ...query,

    type: remoteQuery.isReady ? ("remote" as const) : ("local" as const),
    refetch: useCallback(() => {
      const promise = remoteQuery.refetch()
      if (isLoggedIn) void unreadSyncService.resetFromRemote()
      return promise
    }, [remoteQuery, isLoggedIn]),
    entriesIds: entryIds,
    groupedCounts,
    isFetching: remoteQuery.isFetching,
    isFetchingNextPage: remoteQuery.isFetchingNextPage,
    isLoading: remoteQuery.isLoading,
  }
}

const useFetchEntryContentByStream = (remoteEntryIds?: string[]) => {
  const { mutate: updateEntryContent } = useMutation({
    mutationKey: ["stream-entry-content", remoteEntryIds],
    mutationFn: (remoteEntryIds: string[]) =>
      entrySyncServices.fetchEntryContentByStream(remoteEntryIds),
  })

  useEffect(() => {
    if (!remoteEntryIds) return
    updateEntryContent(remoteEntryIds)
  }, [remoteEntryIds, updateEntryContent])
}
