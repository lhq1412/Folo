import type { UpdaterStatusAtom } from "~/atoms/updater"
import { setUpdaterStatus } from "~/atoms/updater"

import { broadcastPwaUpdateMessage, deferPwaUpdateForSession } from "./update-coordinator"

export function createPwaUpdaterStatus(
  status: "ready" | "deferred" | "updating" | "failed",
  finishUpdate: () => Promise<void>,
  options?: {
    error?: string
    updateId?: string | null
    reloadOnly?: boolean
  },
): NonNullable<UpdaterStatusAtom> {
  const { error, updateId, reloadOnly } = options ?? {}

  return {
    type: "pwa",
    status,
    error,
    reloadOnly,
    finishUpdate,
    deferUpdate: () => {
      deferPwaUpdateForSession(updateId ?? undefined)
      setUpdaterStatus(createPwaUpdaterStatus("deferred", finishUpdate, { error, updateId }))

      if (updateId) {
        broadcastPwaUpdateMessage({ type: "deferred", updateId })
      }
    },
  }
}
