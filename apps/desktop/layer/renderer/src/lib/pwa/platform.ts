export function isStandaloneDisplayMode(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true
  }

  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
}

export function isIosDevice(): boolean {
  const userAgent = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return true
  }

  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

export function isIosSafariInstallContext(): boolean {
  if (!isIosDevice() || isStandaloneDisplayMode()) {
    return false
  }

  const isSafari =
    /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent)
  return isSafari
}

export function isChromiumInstallContext(): boolean {
  return !isIosDevice() && !isStandaloneDisplayMode()
}
