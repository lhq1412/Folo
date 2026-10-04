import { useEntry } from "@follow/store/entry/hooks"
import type { EntryModel } from "@follow/store/entry/types"
import { useIsLoggedIn } from "@follow/store/user/hooks"

import { useGuestEntryIsRead } from "~/atoms/guest-read"

import { useRouteParamsSelector } from "./useRouteParams"

const selector = (state: EntryModel) => state.read
export function useEntryIsRead(entryId?: string) {
  const entryRead = useEntry(entryId, selector)

  const isLoggedIn = useIsLoggedIn()
  const guestRead = useGuestEntryIsRead(entryId)

  return useRouteParamsSelector(
    (params) => {
      if (!isLoggedIn) return guestRead
      if (params.isCollection) {
        return true
      }
      if (entryRead === undefined) return false
      return entryRead
    },
    [entryRead, guestRead, isLoggedIn],
  )
}
