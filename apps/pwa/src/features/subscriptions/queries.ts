import { queryKeys } from "../../domain/query-keys"
import { followApi } from "../../infrastructure/api"

export const subscriptionsQueryOptions = () => ({
  queryKey: queryKeys.subscriptions.root(),
  queryFn: async () => (await followApi.subscriptions.get({})).data,
})
