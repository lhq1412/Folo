import { DEV } from "@follow/shared/constants"

import { logPwaLayoutProbe, probePwaLayoutGeometry } from "~/lib/pwa/layout-diagnostics"
import { isStandaloneDisplayMode } from "~/lib/pwa/platform"
import { DebugRegistry } from "~/modules/debug/registry"

function syncDisplayModeDataset() {
  document.documentElement.dataset.displayMode = isStandaloneDisplayMode()
    ? "standalone"
    : "browser"
}

export function initializePwaLayout() {
  syncDisplayModeDataset()

  const displayModeQuery = window.matchMedia("(display-mode: standalone)")
  const handleDisplayModeChange = () => {
    syncDisplayModeDataset()
  }

  displayModeQuery.addEventListener("change", handleDisplayModeChange)
  window.addEventListener("pageshow", syncDisplayModeDataset)

  return () => {
    displayModeQuery.removeEventListener("change", handleDisplayModeChange)
    window.removeEventListener("pageshow", syncDisplayModeDataset)
  }
}

if (DEV) {
  DebugRegistry.add("PWA layout probe", async () => {
    const result = await probePwaLayoutGeometry()
    logPwaLayoutProbe(result)
    return result
  })
}
