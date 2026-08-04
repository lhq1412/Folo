import {
  completePwaUpdate,
  consumePwaUpdateCompletion,
  getCurrentPwaUpdateId,
  hasProcessedLifecycleCompletion,
  hydratePwaUpdateState,
  persistCanonicalPwaUpdateId,
  refreshPwaUpdateState,
  resetPwaUpdateCoordinatorForTests,
} from "./update-coordinator"
import { getCachedPwaUpdateState } from "./update-state-store"

export type PwaCoordinatorE2ESnapshot = {
  generation: number
  activeUpdateId: string | null
  completed: {
    updateId: string
    generation: number
    nonce: string
    completedAt: number
  } | null
  deferred: {
    updateId: string
    deferredAt: number
    generation: number
  } | null
}

export type PwaCoordinatorE2EApi = {
  hydrate: () => Promise<void>
  refresh: () => Promise<void>
  reset: () => Promise<void>
  persistCanonical: (updateId: string) => Promise<string>
  complete: (
    updateId: string,
    expectedGeneration: number,
  ) => Promise<{
    result: "accepted" | "stale"
    record?: {
      updateId: string
      nonce: string
      completedAt: number
      generation?: number
    }
  }>
  consumeCompletion: (record: {
    updateId: string
    nonce: string
    completedAt: number
  }) => Promise<string>
  getSnapshot: () => PwaCoordinatorE2ESnapshot
  hasProcessedNonce: (nonce: string) => boolean
  getActiveUpdateId: () => string | null
}

declare global {
  interface Window {
    __FOLO_E2E_ENABLE_PWA_COORDINATOR__?: boolean
    __FOLO_PWA_COORDINATOR__?: PwaCoordinatorE2EApi
  }
}

function readSnapshot(): PwaCoordinatorE2ESnapshot {
  const state = getCachedPwaUpdateState()
  return {
    generation: state?.generation ?? 0,
    activeUpdateId: state?.activeUpdateId ?? null,
    completed: state?.completed
      ? {
          updateId: state.completed.updateId,
          generation: state.completed.generation,
          nonce: state.completed.nonce,
          completedAt: state.completed.completedAt,
        }
      : null,
    deferred: state?.deferred ?? null,
  }
}

export function registerPwaCoordinatorE2EHook(): void {
  if (typeof window === "undefined" || !window.__FOLO_E2E_ENABLE_PWA_COORDINATOR__) {
    return
  }

  window.__FOLO_PWA_COORDINATOR__ = {
    hydrate: async () => {
      await hydratePwaUpdateState()
    },
    refresh: async () => {
      await refreshPwaUpdateState()
    },
    reset: async () => {
      await resetPwaUpdateCoordinatorForTests()
    },
    persistCanonical: async (updateId: string) => {
      return persistCanonicalPwaUpdateId(updateId)
    },
    complete: async (updateId: string, expectedGeneration: number) => {
      const outcome = await completePwaUpdate({ updateId, expectedGeneration })
      if (outcome.result === "accepted") {
        return {
          result: outcome.result,
          record: {
            updateId: outcome.record.updateId,
            nonce: outcome.record.nonce,
            completedAt: outcome.record.completedAt,
            generation: outcome.record.generation,
          },
        }
      }

      return { result: outcome.result }
    },
    consumeCompletion: async (record) => {
      return consumePwaUpdateCompletion({
        updateId: record.updateId,
        state: "completed",
        completedAt: record.completedAt,
        nonce: record.nonce,
      })
    },
    getSnapshot: readSnapshot,
    hasProcessedNonce: hasProcessedLifecycleCompletion,
    getActiveUpdateId: getCurrentPwaUpdateId,
  }
}
