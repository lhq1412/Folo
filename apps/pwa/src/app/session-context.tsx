import { createContext, useContext } from "react"

export type LiteSessionUser = {
  email: string
  id: string
  name: string
}

export type LiteSessionValue = {
  isOffline: boolean
  isSnapshot: boolean
  user: LiteSessionUser
}

const LiteSessionContext = createContext<LiteSessionValue | null>(null)

export const LiteSessionProvider = LiteSessionContext.Provider

export const useLiteSession = () => {
  const value = useContext(LiteSessionContext)
  if (!value) {
    throw new Error("useLiteSession must be used inside SessionBoundary")
  }
  return value
}
