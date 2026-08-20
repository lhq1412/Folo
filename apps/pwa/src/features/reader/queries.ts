import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"

export const entryDetailQueryOptions = (entryId: string) => ({
  queryKey: queryKeys.entry.detail(entryId),
  queryFn: async () => (await followApi.entries.get({ id: entryId })).data,
})
