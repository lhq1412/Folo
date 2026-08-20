const chains = new Map<string, Promise<void>>()

export const enqueueEntryMutation = (entryId: string, task: () => Promise<void>) => {
  const previous = chains.get(entryId) ?? Promise.resolve()
  const next = previous.then(task, task)
  chains.set(entryId, next)
  void next.finally(() => {
    if (chains.get(entryId) === next) chains.delete(entryId)
  })
  return next
}
