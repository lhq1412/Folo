type LocalEntryVisibility = {
  id: string
  read?: boolean | null
}

export const getVisibleLocalEntryIds = <TEntry extends LocalEntryVisibility>({
  sourceIds,
  entries,
  stickyVisibleIds,
  excludedReadIds,
  unreadOnly,
}: {
  sourceIds: string[]
  entries: Record<string, TEntry | null | undefined>
  stickyVisibleIds?: ReadonlySet<string>
  excludedReadIds?: ReadonlySet<string>
  unreadOnly: boolean
}) => {
  return sourceIds.filter((id) => {
    const entry = entries[id]

    if (!entry || excludedReadIds?.has(id)) return false
    if (unreadOnly && !!entry.read && !stickyVisibleIds?.has(entry.id)) {
      return false
    }

    return true
  })
}
