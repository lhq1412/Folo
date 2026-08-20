import { useParams, useSearchParams } from "react-router"

import { EmptyReader, Reader } from "../reader/Reader"
import { getTimelineHref, getTimelineView } from "./model"
import { Timeline } from "./Timeline"

export function Component() {
  const { entryId } = useParams<{ entryId: string }>()
  const [searchParams] = useSearchParams()
  const view = getTimelineView(searchParams.get("view"))

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
      <Timeline selectedId={entryId} view={view} />
      {entryId ? <Reader backTo={getTimelineHref(view)} entryId={entryId} /> : <EmptyReader />}
    </div>
  )
}
