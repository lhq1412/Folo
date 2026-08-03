/** Tailwind `lg` breakpoint minus one pixel — matches `useMobile()`. */
export const MOBILE_MAX_WIDTH_PX = 1023

export const DESKTOP_MIN_WIDTH_PX = 1024

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`

export function getIsMobileViewport(width = window.innerWidth): boolean {
  return width <= MOBILE_MAX_WIDTH_PX && width !== 0
}
