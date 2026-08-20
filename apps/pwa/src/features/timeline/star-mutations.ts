import type { FeedViewType } from "@follow-app/client-sdk"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import type { EntryListItem } from "../../domain/entry"
import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"
import type { QuerySnapshot } from "./entry-state"
import {
  applyEntryStarState,
  findEntryInCaches,
  restoreQuerySnapshots,
  snapshotEntryQueries,
} from "./entry-state"
import { enqueueEntryMutation } from "./mutation-queue"

export type EntryStarVariables = {
  entryId: string
  view?: FeedViewType
  listItem?: EntryListItem
}

export const useSaveEntry = () => {
  const queryClient = useQueryClient()
  const mutation = useMutation<void, Error, EntryStarVariables, { snapshots: QuerySnapshot[] }>({
    mutationFn: async ({ entryId, view }: EntryStarVariables) => {
      await followApi.collections.post({
        entryId,
        view,
      })
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshots) restoreQuerySnapshots(queryClient, context.snapshots)
    },
    onMutate: async ({ entryId, listItem }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.entries.root() })
      const snapshots = snapshotEntryQueries(queryClient, entryId)
      applyEntryStarState(queryClient, entryId, true, {
        listItem: listItem ?? findEntryInCaches(queryClient, entryId),
      })
      return { snapshots }
    },
  })

  const mutate = useCallback(
    (variables: EntryStarVariables) => {
      void enqueueEntryMutation(variables.entryId, () =>
        mutation.mutateAsync(variables).then(() => undefined),
      )
    },
    [mutation],
  )

  return {
    isError: mutation.isError,
    isPending: mutation.isPending,
    mutate,
    reset: mutation.reset,
    variables: mutation.variables,
  }
}

export const useUnsaveEntry = () => {
  const queryClient = useQueryClient()
  const mutation = useMutation<void, Error, EntryStarVariables, { snapshots: QuerySnapshot[] }>({
    mutationFn: async ({ entryId }: EntryStarVariables) => {
      await followApi.collections.delete({ entryId })
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshots) restoreQuerySnapshots(queryClient, context.snapshots)
    },
    onMutate: async ({ entryId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.entries.root() })
      const snapshots = snapshotEntryQueries(queryClient, entryId)
      applyEntryStarState(queryClient, entryId, false)
      return { snapshots }
    },
  })

  const mutate = useCallback(
    (variables: EntryStarVariables) => {
      void enqueueEntryMutation(variables.entryId, () =>
        mutation.mutateAsync(variables).then(() => undefined),
      )
    },
    [mutation],
  )

  return {
    isError: mutation.isError,
    isPending: mutation.isPending,
    mutate,
    reset: mutation.reset,
    variables: mutation.variables,
  }
}
