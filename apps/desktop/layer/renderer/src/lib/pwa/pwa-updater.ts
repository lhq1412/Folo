import type { UpdaterStatusAtom } from "~/atoms/updater"
import { setUpdaterStatus } from "~/atoms/updater"

import { deferPwaUpdateForSession } from "./update-coordinator"

export function createPwaUpdaterStatus(
  status: "ready" | "deferred" | "updating" | "failed",
  finishUpdate: () => Promise<void>,
  error?: string,
): NonNullable<UpdaterStatusAtom> {
  return {
    type: "pwa",
    status,
    error,
    finishUpdate,
    deferUpdate: () => {
      deferPwaUpdateForSession()
      setUpdaterStatus(createPwaUpdaterStatus("deferred", finishUpdate, error))
    },
  }
}
