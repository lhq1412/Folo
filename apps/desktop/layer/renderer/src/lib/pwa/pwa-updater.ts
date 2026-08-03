import type { UpdaterStatusAtom } from "~/atoms/updater"
import { setUpdaterStatus } from "~/atoms/updater"

import { broadcastPwaUpdateDeferred, deferPwaUpdateForSession } from "./update-coordinator"

export function createPwaUpdaterStatus(
  status: "ready" | "deferred" | "updating" | "failed",
  finishUpdate: () => Promise<void>,
  options?: {
    error?: string
    updateId?: string | null
  },
): NonNullable<UpdaterStatusAtom> {
  const { error, updateId } = options ?? {}

  return {
    type: "pwa",
    status,
    error,
    finishUpdate,
    deferUpdate: () => {
      if (updateId) {
        broadcastPwaUpdateDeferred(updateId)
        return
      }

      deferPwaUpdateForSession()
      setUpdaterStatus(createPwaUpdaterStatus("deferred", finishUpdate, { error, updateId }))
    },
  }
}
