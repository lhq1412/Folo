import { QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useEffect } from "react"

import { queryClient } from "../infrastructure/query-client"
import { queryPersistence } from "../infrastructure/query-persistence"

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    void queryPersistence.restore()
    return queryPersistence.subscribe()
  }, [])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
