import { existsSync, readFileSync } from "node:fs"

import { join } from "pathe"
import type { Plugin, ResolvedConfig } from "vite"

const UNINJECTED_MANIFEST_TOKEN = "__WB_MANIFEST"

export function assertServiceWorkerManifestInjected(swContent: string): void {
  if (swContent.includes(UNINJECTED_MANIFEST_TOKEN)) {
    throw new Error(
      `Service worker build failed: ${UNINJECTED_MANIFEST_TOKEN} was not injected. Check vite-plugin-pwa injectManifest configuration.`,
    )
  }

  if (!swContent.includes("precacheAndRoute(")) {
    throw new Error("Service worker build failed: precacheAndRoute call not found.")
  }
}

export function validateServiceWorkerManifestPlugin(): Plugin {
  let config: ResolvedConfig

  return {
    name: "validate-sw-manifest",
    apply: "build",
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    closeBundle() {
      const swPath = join(config.build.outDir, "sw.js")
      if (!existsSync(swPath)) return

      const swContent = readFileSync(swPath, "utf8")
      assertServiceWorkerManifestInjected(swContent)
    },
  }
}
