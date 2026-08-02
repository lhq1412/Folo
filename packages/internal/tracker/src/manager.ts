import type { IdentifyPayload, TrackPayload } from "./adapters"
import type { TrackerMapper } from "./enums"

export interface TrackerManagerConfig {
  enableBatchProcessing?: boolean
  batchSize?: number
  batchTimeout?: number
  enableErrorRetry?: boolean
  maxRetries?: number
}

export class TrackerManager {
  constructor(_config: TrackerManagerConfig = {}) {}

  async track(_code: TrackerMapper, _properties?: Record<string, unknown>): Promise<void> {}

  async captureException(_error: unknown, _properties?: Record<string, unknown>): Promise<void> {}

  async identify(_payload: IdentifyPayload): Promise<void> {}

  async setUserProperties(_properties: Record<string, unknown>): Promise<void> {}

  async appendUserProperties(_properties: Record<string, unknown>): Promise<void> {}

  async clear(): Promise<void> {}

  async flush(): Promise<void> {}

  getStats(): {
    totalAdapters: number
    enabledAdapters: number
    adapterNames: string[]
    queueSize: number
  } {
    return {
      totalAdapters: 0,
      enabledAdapters: 0,
      adapterNames: [],
      queueSize: 0,
    }
  }

  // Kept for compatibility with legacy call sites that still pass payloads around.
  protected _unusedPayload(_payload: TrackPayload): void {}
}
