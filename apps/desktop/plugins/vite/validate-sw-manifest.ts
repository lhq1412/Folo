import { existsSync, readFileSync } from "node:fs"

import { join } from "pathe"
import type { Plugin, ResolvedConfig } from "vite"

import type { PrecacheManifestEntry } from "./precache-manifest-snapshot"
import {
  assertPrecacheManifestInjectedIntoServiceWorker,
  assertPrecacheManifestSnapshot,
  consumePrecacheManifestSnapshot,
} from "./precache-manifest-snapshot"

const UNINJECTED_MANIFEST_TOKEN = "__WB_MANIFEST"

export function assertServiceWorkerFileExists(swPath: string): void {
  if (!existsSync(swPath)) {
    throw new Error(`Service worker build failed: ${swPath} was not generated.`)
  }
}

export function assertServiceWorkerBuild({
  swContent,
  precacheManifest,
}: {
  precacheManifest: PrecacheManifestEntry[] | null
  swContent: string
}): void {
  if (swContent.includes(UNINJECTED_MANIFEST_TOKEN)) {
    throw new Error(
      `Service worker build failed: ${UNINJECTED_MANIFEST_TOKEN} was not injected. Check vite-plugin-pwa injectManifest configuration.`,
    )
  }

  assertPrecacheManifestSnapshot(precacheManifest)
  assertPrecacheManifestInjectedIntoServiceWorker(swContent, precacheManifest)
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
      const precacheManifest = consumePrecacheManifestSnapshot()

      assertServiceWorkerBuild({ swContent, precacheManifest })
    },
  }
}
