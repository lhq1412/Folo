import type { QueryClient } from "@tanstack/react-query"

import type { EntryListItem, EntrySession } from "../../domain/entry"
import { entryIdOf, entrySessionFromListItem, starredCollectionStamp } from "../../domain/entry"
import type { EntryInfiniteData } from "../../domain/entry-cache"
import {
  findEntryInInfiniteData,
  mapEntriesInInfiniteData,
  prependEntryInInfiniteData,
} from "../../domain/entry-cache"
import {
  isSavedEntriesQueryKey,
  isUnreadOnlyEntriesQueryKey,
  queryKeys,
} from "../../domain/query-keys"

export type QuerySnapshot = {
  queryKey: readonly unknown[]
  data: unknown
}

const patchEntryLists = (
  queryClient: QueryClient,
  updater: (
    data: EntryInfiniteData | undefined,
    queryKey: readonly unknown[],
  ) => EntryInfiniteData | undefined,
) => {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.entries.root() })) {
    queryClient.setQueryData(query.queryKey, (current: EntryInfiniteData | undefined) =>
      updater(current, query.queryKey),
    )
  }
}

const patchEntrySession = (
  queryClient: QueryClient,
  entryId: string,
  updater: (session: EntrySession | undefined) => EntrySession | undefined,
) => {
  queryClient.setQueryData(queryKeys.entry.session(entryId), updater)
}

export const findEntryInCaches = (
  queryClient: QueryClient,
  entryId: string,
): EntryListItem | undefined => {
  for (const query of queryClient.getQueryCache().findAll({ queryKey: queryKeys.entries.root() })) {
    const item = findEntryInInfiniteData(query.state.data as EntryInfiniteData | undefined, entryId)
    if (item) return item
  }
  return undefined
}

export const snapshotEntryQueries = (
  queryClient: QueryClient,
  entryId: string,
): QuerySnapshot[] => {
  const queries = [
    ...queryClient.getQueryCache().findAll({ queryKey: queryKeys.entries.root() }),
    ...queryClient
      .getQueryCache()
      .findAll({ exact: true, queryKey: queryKeys.entry.session(entryId) }),
  ]
  return queries.map((query) => ({ data: query.state.data, queryKey: query.queryKey }))
}

export const restoreQuerySnapshots = (queryClient: QueryClient, snapshots: QuerySnapshot[]) => {
  for (const snapshot of snapshots) {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data)
  }
}

export const applyEntryReadState = (
  queryClient: QueryClient,
  entryId: string,
  read: boolean,
  options?: { prependItem?: EntryListItem },
) => {
  patchEntryLists(queryClient, (data, queryKey) => {
    if (!data) return data

    if (read && isUnreadOnlyEntriesQueryKey(queryKey)) {
      return mapEntriesInInfiniteData(data, (item) => (entryIdOf(item) === entryId ? null : item))
    }

    if (!read && isUnreadOnlyEntriesQueryKey(queryKey)) {
      const existing = findEntryInInfiniteData(data, entryId)
      if (existing) {
        return mapEntriesInInfiniteData(data, (item) =>
          entryIdOf(item) === entryId ? { ...item, read: false } : item,
        )
      }
      if (options?.prependItem) {
        return prependEntryInInfiniteData(data, { ...options.prependItem, read: false })
      }
      return data
    }

    return mapEntriesInInfiniteData(data, (item) =>
      entryIdOf(item) === entryId ? { ...item, read } : item,
    )
  })

  patchEntrySession(queryClient, entryId, (session) =>
    session
      ? {
          ...session,
          listItem: session.listItem ? { ...session.listItem, read } : session.listItem,
          read,
        }
      : session,
  )
}

export const applyEntryStarState = (
  queryClient: QueryClient,
  entryId: string,
  starred: boolean,
  options?: { listItem?: EntryListItem },
) => {
  const collections = starred ? starredCollectionStamp() : undefined
  const withCollections = (item: EntryListItem): EntryListItem => ({ ...item, collections })

  patchEntryLists(queryClient, (data, queryKey) => {
    if (!data) return data

    if (!starred && isSavedEntriesQueryKey(queryKey)) {
      return mapEntriesInInfiniteData(data, (item) => (entryIdOf(item) === entryId ? null : item))
    }

    if (starred && isSavedEntriesQueryKey(queryKey)) {
      const existing = findEntryInInfiniteData(data, entryId)
      if (existing) {
        return mapEntriesInInfiniteData(data, (item) =>
          entryIdOf(item) === entryId ? withCollections(item) : item,
        )
      }
      const source = options?.listItem
      if (!source) return data
      return prependEntryInInfiniteData(data, withCollections(source))
    }

    return mapEntriesInInfiniteData(data, (item) =>
      entryIdOf(item) === entryId ? withCollections(item) : item,
    )
  })

  patchEntrySession(queryClient, entryId, (session) =>
    session
      ? {
          ...session,
          listItem: session.listItem ? withCollections(session.listItem) : session.listItem,
          starred,
        }
      : session,
  )
}

export const ensureEntrySession = (queryClient: QueryClient, entryId: string) => {
  const existing = queryClient.getQueryData<EntrySession>(queryKeys.entry.session(entryId))
  if (existing) return existing
  const item = findEntryInCaches(queryClient, entryId)
  if (!item) return undefined
  const session = entrySessionFromListItem(item)
  queryClient.setQueryData(queryKeys.entry.session(entryId), session)
  return session
}
