export type PwaUpdateCompletionConsumeResult = "accepted" | "stale" | "duplicate" | "expired"

export type PwaUpdateDiagnosticEvent =
  | {
      event: "pwa_update_completion_consumed"
      result: PwaUpdateCompletionConsumeResult
      updateId: string
      generation: number
    }
  | {
      event: "pwa_update_adoption_conflict"
      updateId: string
      generation: number
    }
  | {
      event: "pwa_update_revision_handshake_failed"
      generation: number
    }
  | {
      event: "pwa_update_stale_finish_closure"
      updateId: string
      generation: number
    }
  | {
      event: "pwa_update_broadcast_stale"
      messageType: string
      messageGeneration: number
      generation: number
    }
  | {
      event: "pwa_update_no_bc_fallback"
      channel: "storage"
      generation: number
    }
  | {
      event: "pwa_update_origin_completed"
      result: "accepted" | "stale"
      updateId: string
      expectedGeneration: number
      generation: number
    }
  | {
      event: "pwa_update_state_store_failure"
      operation: string
      generation: number
    }
  | {
      event: "pwa_update_runtime_cache_cleanup_failure"
      generation: number
    }

export function logPwaUpdateDiagnostic(event: PwaUpdateDiagnosticEvent): void {
  console.info("[PWA]", event)
}
