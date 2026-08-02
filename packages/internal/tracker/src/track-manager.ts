import { TrackerManager } from "./manager"
import type { Tracker } from "./types"

class TrackManager extends TrackerManager {
  private trackFns: Tracker[] = []

  setTrackFn(fn: Tracker) {
    this.trackFns.push(fn)

    return () => {
      this.trackFns = this.trackFns.filter((t) => t !== fn)
    }
  }

  getTrackFn(): Tracker {
    return (code, properties) => {
      if (this.trackFns.length === 0) {
        return Promise.resolve()
      }

      return Promise.all(this.trackFns.map((fn) => fn(code, properties)))
    }
  }
}

export const trackManager = new TrackManager()
export const improvedTrackManager = trackManager
