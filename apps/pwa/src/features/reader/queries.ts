import { FeedViewType } from "@follow-app/client-sdk"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { EntrySession } from "../../domain/entry"
import { entrySessionFromListItem } from "../../domain/entry"
import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"
import { ensureEntrySession, findEntryInCaches } from "../timeline/entry-state"

export const entryDetailQueryOptions = (entryId: string) => ({
  queryFn: async () => (await followApi.entries.get({ id: entryId })).data,
  queryKey: queryKeys.entry.detail(entryId),
})

export const useEntrySessionQuery = (entryId: string) => {
  const queryClient = useQueryClient()
  const hydrated = ensureEntrySession(queryClient, entryId)
  return useQuery({
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<EntrySession> => {
      const item = findEntryInCaches(queryClient, entryId)
      if (item) return entrySessionFromListItem(item)
      try {
        const starred = Boolean((await followApi.collections.get({ entryId })).data)
        return { id: entryId, isInbox: false, read: false, starred }
      } catch {
        return { id: entryId, isInbox: false, read: false, starred: false }
      }
    },
    queryKey: queryKeys.entry.session(entryId),
    ...(hydrated ? { initialData: hydrated } : {}),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export const sessionView = (session: EntrySession | undefined, fallback?: FeedViewType) =>
  session?.view ?? fallback ?? FeedViewType.Articles
