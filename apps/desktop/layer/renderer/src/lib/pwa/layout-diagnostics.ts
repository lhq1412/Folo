import { ROOT_CONTAINER_ID } from "~/constants/dom"
import { MOBILE_SUBSCRIPTION_DRAWER_ID } from "~/lib/mobile-sidebar"

import { isStandaloneDisplayMode } from "./platform"

export interface PwaLayoutProbeResult {
  timestamp: string
  userAgent: string
  displayMode: "standalone" | "browser"
  navigatorStandalone: boolean | null
  orientation: string | null
  devicePixelRatio: number
  viewport: {
    innerWidth: number
    innerHeight: number
    outerWidth: number
    outerHeight: number
    documentClientWidth: number
    documentClientHeight: number
    visualViewport: {
      width: number
      height: number
      offsetTop: number
      offsetLeft: number
      pageTop: number
      pageLeft: number
      scale: number
    } | null
  }
  safeArea: {
    top: string
    right: string
    bottom: string
    left: string
  }
  viewportDataset: string | null
  root: ReturnType<typeof readRect>
  shell: ReturnType<typeof readRect>
  main: ReturnType<typeof readRect>
  drawer: ReturnType<typeof readRect>
  serviceWorker: {
    scope: string
    active: string | null
    waiting: string | null
    installing: string | null
    controller: string | null
  } | null
  assets: {
    scripts: string[]
    styles: (string | null)[]
  }
}

function readRect(selector: string) {
  const element = document.querySelector(selector)
  const rect = element?.getBoundingClientRect()
  return rect
    ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      }
    : null
}

export async function probePwaLayoutGeometry(): Promise<PwaLayoutProbeResult> {
  const probe = document.createElement("div")
  probe.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "pointer-events:none",
    "padding-top:var(--app-safe-top)",
    "padding-right:var(--app-safe-right)",
    "padding-bottom:var(--app-safe-bottom)",
    "padding-left:var(--app-safe-left)",
  ].join(";")
  document.body.append(probe)

  const registration = await navigator.serviceWorker?.getRegistration()
  const style = getComputedStyle(probe)
  const visual = window.visualViewport

  const result: PwaLayoutProbeResult = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    displayMode: isStandaloneDisplayMode() ? "standalone" : "browser",
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? null,
    orientation: screen.orientation?.type ?? null,
    devicePixelRatio,
    viewport: {
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      documentClientWidth: document.documentElement.clientWidth,
      documentClientHeight: document.documentElement.clientHeight,
      visualViewport: visual
        ? {
            width: visual.width,
            height: visual.height,
            offsetTop: visual.offsetTop,
            offsetLeft: visual.offsetLeft,
            pageTop: visual.pageTop,
            pageLeft: visual.pageLeft,
            scale: visual.scale,
          }
        : null,
    },
    safeArea: {
      top: style.paddingTop,
      right: style.paddingRight,
      bottom: style.paddingBottom,
      left: style.paddingLeft,
    },
    viewportDataset: document.documentElement.dataset.viewport ?? null,
    root: readRect("#root"),
    shell: readRect(`#${ROOT_CONTAINER_ID}`),
    main: readRect("main"),
    drawer: readRect(`#${MOBILE_SUBSCRIPTION_DRAWER_ID}`),
    serviceWorker: registration
      ? {
          scope: registration.scope,
          active: registration.active?.scriptURL ?? null,
          waiting: registration.waiting?.scriptURL ?? null,
          installing: registration.installing?.scriptURL ?? null,
          controller: navigator.serviceWorker.controller?.scriptURL ?? null,
        }
      : null,
    assets: {
      scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
      styles: [...document.styleSheets].map((sheet) => sheet.href).filter(Boolean),
    },
  }

  probe.remove()
  return result
}

export function logPwaLayoutProbe(result: PwaLayoutProbeResult) {
  console.table({
    displayMode: result.displayMode,
    innerHeight: result.viewport.innerHeight,
    visualHeight: result.viewport.visualViewport?.height,
    clientHeight: result.viewport.documentClientHeight,
    shellHeight: result.shell?.height,
    safeTop: result.safeArea.top,
    safeBottom: result.safeArea.bottom,
  })
  console.log(JSON.stringify(result, null, 2))
}
