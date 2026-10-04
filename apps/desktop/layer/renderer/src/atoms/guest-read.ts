import { atom } from "jotai"

import { createAtomHooks } from "~/lib/jotai"

// Guest read state belongs to this page session and never changes account data.
const [, , , , getGuestReadEntryIds, setGuestReadEntryIds, useGuestReadEntryIdsSelector] =
  createAtomHooks(atom<ReadonlySet<string>>(new Set<string>()))

export { getGuestReadEntryIds }

export const useGuestEntryIsRead = (entryId?: string) =>
  useGuestReadEntryIdsSelector((ids) => !!entryId && ids.has(entryId), [entryId])

export const markGuestEntriesAsRead = (entryIds: string[]) => {
  setGuestReadEntryIds((previousIds) => {
    const nextIds = new Set(previousIds)
    for (const id of entryIds) nextIds.add(id)
    return nextIds.size === previousIds.size ? previousIds : nextIds
  })
}
