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
  const fileStats = precacheManifest
    .map((entry) => {
      const filePath = join(outDir, entry.url.replace(/^\//, ""))
      if (!existsSync(filePath)) {
        return null
      }

      return {
        url: entry.url,
        size: statSync(filePath).size,
      }
    })
    .filter((entry): entry is { size: number; url: string } => entry !== null)

  const totalBytes = fileStats.reduce((sum, entry) => sum + entry.size, 0)
  const largestFiles = [...fileStats].sort((left, right) => right.size - left.size).slice(0, 5)

  console.info(
    `[PWA] Precache manifest: ${precacheManifest.length} entries, ${totalBytes} bytes total.`,
  )

  if (largestFiles.length > 0) {
    console.info(
      `[PWA] Largest precache assets: ${largestFiles
        .map((entry) => `${entry.url} (${entry.size} bytes)`)
        .join(", ")}`,
    )
  }
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
