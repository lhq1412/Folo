import { existsSync, readFileSync } from "node:fs"

import { join } from "pathe"
import type { Plugin, ResolvedConfig } from "vite"

const UNINJECTED_MANIFEST_TOKEN = "__WB_MANIFEST"

const EMPTY_PRECACHE_PATTERN = /(?:precacheAndRoute|wt)\(\s*\[\s*\]\s*\)/

const PRECACHE_ENTRY_PATTERN = /\[\s*\{[^[\]{}]*(?:"url"\s*:\s*"[^"]+"|url\s*:\s*"[^"]+")/

export function assertServiceWorkerFileExists(swPath: string): void {
  if (!existsSync(swPath)) {
    throw new Error(`Service worker build failed: ${swPath} was not generated.`)
  }
}

export function assertServiceWorkerManifestInjected(swContent: string): void {
  if (swContent.includes(UNINJECTED_MANIFEST_TOKEN)) {
    throw new Error(
      `Service worker build failed: ${UNINJECTED_MANIFEST_TOKEN} was not injected. Check vite-plugin-pwa injectManifest configuration.`,
    )
  }

  if (EMPTY_PRECACHE_PATTERN.test(swContent)) {
    throw new Error("Service worker build failed: precache manifest is empty.")
  }

  if (!PRECACHE_ENTRY_PATTERN.test(swContent)) {
    throw new Error(
      "Service worker build failed: no precache manifest entries found in service worker.",
    )
  }
}

export function validateServiceWorkerManifestPlugin(): Plugin {
  let config: ResolvedConfig

  return {
    name: "validate-sw-manifest",
    apply: "build",
    enforce: "post",
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    closeBundle() {
      const swPath = join(config.build.outDir, "sw.js")
      assertServiceWorkerFileExists(swPath)

      const swContent = readFileSync(swPath, "utf8")
      assertServiceWorkerManifestInjected(swContent)
    },
  }
}
