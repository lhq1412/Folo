import { createQueryPersistence } from "./persistence"
import { queryClient } from "./query-client"

export const queryPersistence = createQueryPersistence(queryClient)
