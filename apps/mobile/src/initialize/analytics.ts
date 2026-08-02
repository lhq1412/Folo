import { whoami } from "@follow/store/user/getters"
import { setFirebaseTracker, tracker } from "@follow/tracker"
import type { AuthUser } from "@follow-app/client-sdk"
import { getAnalytics } from "@react-native-firebase/analytics"
import { nativeApplicationVersion, nativeBuildVersion } from "expo-application"

export const initAnalytics = async () => {
  setFirebaseTracker(getAnalytics())

  tracker.manager.appendUserProperties({
    build: "rn",
    version: nativeApplicationVersion,
    buildId: nativeBuildVersion,
  })

  const user = whoami()
  if (user) {
    tracker.identify(user as AuthUser)
  }
}
