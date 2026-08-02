import { TrackerPoints } from "./tracker-points"

export const tracker = new TrackerPoints()

export {
  type CaptureExceptionPayload,
  type IdentifyPayload,
  type TrackerAdapter,
  type TrackPayload,
} from "./adapters"
export { TrackerMapper } from "./enums"
export { TrackerManager, type TrackerManagerConfig } from "./manager"
export { improvedTrackManager, trackManager } from "./track-manager"
export { type AllTrackers, TrackerPoints } from "./tracker-points"
