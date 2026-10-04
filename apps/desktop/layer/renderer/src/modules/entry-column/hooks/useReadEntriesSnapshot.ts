import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export const useReadEntriesSnapshot = (
  queryKey: string,
  getReadEntryIds: () => ReadonlySet<string>,
) => {
  const initialSnapshot = useMemo(
    () => ({ queryKey, ids: new Set(getReadEntryIds()) }),
    [queryKey, getReadEntryIds],
  )
  const [snapshot, setSnapshot] = useState({ initialSnapshot, ids: initialSnapshot.ids })
  const currentTimelineRef = useRef(initialSnapshot)
  useEffect(() => {
    currentTimelineRef.current = initialSnapshot
    setSnapshot({ initialSnapshot, ids: initialSnapshot.ids })
  }, [initialSnapshot])

  // Keep the read filter fixed until a successful refresh or a timeline change.
  const readEntryIds =
    snapshot.initialSnapshot === initialSnapshot ? snapshot.ids : initialSnapshot.ids
  const refreshReadEntryIds = useCallback(() => {
    if (currentTimelineRef.current !== initialSnapshot) return false
    setSnapshot({ initialSnapshot, ids: new Set(getReadEntryIds()) })
    return true
  }, [initialSnapshot, getReadEntryIds])

  return { readEntryIds, refreshReadEntryIds }
}
