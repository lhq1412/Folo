export const retainVisibleReadEntryIds = ({
  sourceIds,
  previousIds,
  retainIds,
}: {
  sourceIds: string[]
  previousIds: readonly string[]
  retainIds: ReadonlySet<string>
}): string[] => {
  const visibleIds = new Set(sourceIds)
  const result = [...visibleIds]

  for (const [index, id] of previousIds.entries()) {
    if (!retainIds.has(id) || visibleIds.has(id)) continue

    const nextId = previousIds.slice(index + 1).find((id) => visibleIds.has(id))
    if (nextId) {
      result.splice(result.indexOf(nextId), 0, id)
    } else {
      const previousId = previousIds.slice(0, index).findLast((id) => visibleIds.has(id))
      const insertionIndex = previousId ? result.indexOf(previousId) + 1 : result.length
      result.splice(insertionIndex, 0, id)
    }
    visibleIds.add(id)
  }

  return result
}
