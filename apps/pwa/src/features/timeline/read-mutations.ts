import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"
import type { QuerySnapshot } from "./entry-state"
import {
  applyEntryReadState,
  findEntryInCaches,
  restoreQuerySnapshots,
  snapshotEntryQueries,
} from "./entry-state"
import { enqueueEntryMutation } from "./mutation-queue"

export type EntryReadVariables = {
  entryId: string
  isInbox?: boolean
}

const inboxPayload = (isInbox?: boolean) => (isInbox ? { isInbox: true } : {})

export const useMarkEntryRead = () => {
  const queryClient = useQueryClient()
  const mutation = useMutation<void, Error, EntryReadVariables, { snapshots: QuerySnapshot[] }>({
    mutationFn: async ({ entryId, isInbox }: EntryReadVariables) => {
      await followApi.reads.markAsRead({
        entryIds: [entryId],
        ...inboxPayload(isInbox),
      })
    },
    onError: (_error, variables, context) => {
      if (context?.snapshots) restoreQuerySnapshots(queryClient, context.snapshots)
    },
    onMutate: async ({ entryId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.entries.root() })
      const snapshots = snapshotEntryQueries(queryClient, entryId)
      applyEntryReadState(queryClient, entryId, true)
      return { snapshots }
    },
  })

  const mutate = useCallback(
    (variables: EntryReadVariables) => {
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

export const useMarkEntryUnread = () => {
  const queryClient = useQueryClient()
  const mutation = useMutation<void, Error, EntryReadVariables, { snapshots: QuerySnapshot[] }>({
    mutationFn: async ({ entryId, isInbox }: EntryReadVariables) => {
      await followApi.reads.markAsUnread({
        entryId,
        ...inboxPayload(isInbox),
      })
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshots) restoreQuerySnapshots(queryClient, context.snapshots)
    },
    onMutate: async ({ entryId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.entries.root() })
      const snapshots = snapshotEntryQueries(queryClient, entryId)
      const prependItem = findEntryInCaches(queryClient, entryId)
      applyEntryReadState(queryClient, entryId, false, { prependItem })
      return { snapshots }
    },
  })

  const mutate = useCallback(
    (variables: EntryReadVariables) => {
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
