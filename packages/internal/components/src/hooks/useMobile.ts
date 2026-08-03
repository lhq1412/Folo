import { getIsMobileViewport } from "../constants/viewport"
import { useViewport } from "./useViewport"

export {
  DESKTOP_MIN_WIDTH_PX,
  getIsMobileViewport,
  MOBILE_MAX_WIDTH_PX,
} from "../constants/viewport"

export const useMobile = () => {
  return useViewport((v) => getIsMobileViewport(v.w))
}

export const isMobile = () => {
  return getIsMobileViewport()
}
