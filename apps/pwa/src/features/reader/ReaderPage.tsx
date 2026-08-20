import { useParams, useSearchParams } from "react-router"

import { getTimelineHref, getTimelineView } from "../timeline/model"
import { Reader } from "./Reader"

export function Component() {
  const { entryId } = useParams<{ entryId: string }>()
  const [searchParams] = useSearchParams()
  const view = getTimelineView(searchParams.get("view"))

  if (!entryId) return null
  return <Reader backTo={getTimelineHref(view)} entryId={entryId} />
}
