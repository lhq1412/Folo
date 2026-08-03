import { existsSync, readFileSync, statSync } from "node:fs"

import { join } from "pathe"
import type { Plugin, ResolvedConfig } from "vite"

import { FOLLO_PRECACHE_MANIFEST_INJECTION_POINT } from "./precache-manifest-entries"
import type { PrecacheManifestEntry } from "./precache-manifest-snapshot"
import {
  assertPrecacheManifestInjectedIntoServiceWorker,
  assertPrecacheManifestSnapshot,
  consumePrecacheManifestSnapshot,
} from "./precache-manifest-snapshot"

export function reportPrecacheManifestStats({
  precacheManifest,
  outDir,
}: {
  outDir: string
  precacheManifest: PrecacheManifestEntry[]
}): void {
  const fileSizes = precacheManifest
    .map((entry) => {
      const filePath = join(outDir, entry.url.replace(/^\//, ""))
      if (!existsSync(filePath)) {
        return null
      }

      return statSync(filePath).size
    })
    .filter((size): size is number => size !== null)

  const totalBytes = fileSizes.reduce((sum, size) => sum + size, 0)
  const largestBytes = fileSizes.length > 0 ? Math.max(...fileSizes) : 0

  console.info(
    `[PWA] Precache manifest: ${precacheManifest.length} entries, ${totalBytes} bytes total, largest asset ${largestBytes} bytes.`,
  )
}

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
  if (swContent.includes(FOLLO_PRECACHE_MANIFEST_INJECTION_POINT)) {
    throw new Error(
      `Service worker build failed: ${FOLLO_PRECACHE_MANIFEST_INJECTION_POINT} was not injected. Check vite-plugin-pwa injectManifest configuration.`,
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
      reportPrecacheManifestStats({ precacheManifest, outDir: config.build.outDir })
    },
  }
}
