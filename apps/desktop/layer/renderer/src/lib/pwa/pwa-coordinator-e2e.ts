import {
  consumePwaUpdateCompletion,
  getCurrentPwaUpdateId,
  hasProcessedLifecycleCompletion,
  hydratePwaUpdateState,
  markPwaUpdateCompleted,
  persistCanonicalPwaUpdateId,
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
  reset: () => Promise<void>
  persistCanonical: (updateId: string) => Promise<string>
  markCompleted: (updateId: string) => Promise<{
    updateId: string
    nonce: string
    completedAt: number
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
    reset: async () => {
      await resetPwaUpdateCoordinatorForTests()
    },
    persistCanonical: async (updateId: string) => {
      return persistCanonicalPwaUpdateId(updateId)
    },
    markCompleted: async (updateId: string) => {
      const record = await markPwaUpdateCompleted(updateId)
      return {
        updateId: record.updateId,
        nonce: record.nonce,
        completedAt: record.completedAt,
      }
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
