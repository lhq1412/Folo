import type { TrackerMapper } from "./enums"
import { TrackerManager } from "./manager"
import type { Tracker } from "./types"

class TrackManager extends TrackerManager {
  private trackFns: Tracker[] = []

  constructor() {
    super({
      enableBatchProcessing: false,
      enableErrorRetry: true,
      maxRetries: 2,
    })
  }

  setTrackFn(fn: Tracker) {
    this.trackFns.push(fn)

    return () => {
      this.trackFns = this.trackFns.filter((t) => t !== fn)
    }
  }

  getTrackFn(): Tracker {
    if (this.trackFns.length === 0 && this.getEnabledAdapters().length === 0) {
      console.error("[Tracker warn]: Track function not set")
    }
    return (code, properties) => {
      const legacyPromises = this.trackFns.map((fn) => fn(code, properties))
      const modernPromise = this.track(code as TrackerMapper, properties)
      return Promise.all([...legacyPromises, modernPromise])
    }
  }
}

export const trackManager = new TrackManager()
export const improvedTrackManager = trackManager
