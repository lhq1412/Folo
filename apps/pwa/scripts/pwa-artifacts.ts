import { PWA_RUNTIME_CACHE_NAMES } from "../src/infrastructure/pwa/cache-config.ts"

export type WebManifestIcon = {
  src: string
  sizes?: string
  type?: string
  purpose?: string
}

export type WebManifest = {
  name?: string
  short_name?: string
  start_url?: string
  display?: string
  icons?: WebManifestIcon[]
}

export type ArtifactFailure = {
  code:
    | "missing-file"
    | "invalid-manifest"
    | "missing-icon"
    | "service-worker"
    | "api-cache"
    | "registration"
  message: string
}

const requiredDistFiles = ["index.html", "manifest.webmanifest", "sw.js"]

export const findWorkboxRuntimeFile = (filenames: string[]) =>
  filenames.find((name) => /^workbox-.*\.js$/.test(name))

export const validateWebManifest = (manifest: unknown) => {
  const failures: ArtifactFailure[] = []
  if (!manifest || typeof manifest !== "object") {
    return [{ code: "invalid-manifest", message: "manifest.webmanifest is not a JSON object." }]
  }

  const value = manifest as WebManifest
  if (!value.name) failures.push({ code: "invalid-manifest", message: "Manifest is missing name." })
  if (!value.start_url) {
    failures.push({ code: "invalid-manifest", message: "Manifest is missing start_url." })
  }
  if (value.display !== "standalone") {
    failures.push({
      code: "invalid-manifest",
      message: `Manifest display must be standalone, received ${String(value.display)}.`,
    })
  }
  if (!value.icons?.length) {
    failures.push({ code: "invalid-manifest", message: "Manifest does not declare any icons." })
  }
  return failures
}

export const validateServiceWorker = (source: string) => {
  const failures: ArtifactFailure[] = []
  if (source.includes("__WB_MANIFEST")) {
    failures.push({
      code: "service-worker",
      message: "sw.js still contains an unresolved __WB_MANIFEST token.",
    })
  }
  if (!source.includes("precache")) {
    failures.push({
      code: "service-worker",
      message: "sw.js does not look like a Workbox precache service worker.",
    })
  }
  if (/api\.folo\.is|api\.follow\.is/.test(source)) {
    failures.push({
      code: "api-cache",
      message: "sw.js references the API origin; API responses must stay network-only.",
    })
  }
  if (/\bNetworkFirst\b/.test(source)) {
    failures.push({
      code: "api-cache",
      message: "sw.js uses NetworkFirst. API and user data must stay network-only.",
    })
  }
  const usesImageRuntimeCache = /\b(?:CacheFirst|StaleWhileRevalidate)\b/.test(source)
  const requiredCacheNames = Object.values(PWA_RUNTIME_CACHE_NAMES)
  if (!usesImageRuntimeCache) {
    failures.push({
      code: "service-worker",
      message: "sw.js does not register bounded image runtime caches.",
    })
  } else {
    for (const cacheName of requiredCacheNames) {
      if (!source.includes(cacheName)) {
        failures.push({
          code: "api-cache",
          message: `sw.js is missing the expected image cache ${cacheName}.`,
        })
      }
    }
  }
  return failures
}

export const validateServiceWorkerRegistration = (bundleSources: string[]) => {
  const combined = bundleSources.join("\n")
  // Vite 8 minifies string literals with backticks (`/sw.js`) as well as quotes.
  if (!/registerSW|serviceWorker\.register|["'`]\/sw\.js["'`]/.test(combined)) {
    return [
      {
        code: "registration" as const,
        message: "Built assets do not register a service worker.",
      },
    ]
  }
  return []
}

export const requiredProductionFiles = (filenames: string[]) => {
  const failures: ArtifactFailure[] = []
  for (const file of requiredDistFiles) {
    if (!filenames.includes(file)) {
      failures.push({ code: "missing-file", message: `Production output is missing ${file}.` })
    }
  }
  if (!findWorkboxRuntimeFile(filenames)) {
    failures.push({
      code: "missing-file",
      message: "Production output is missing a workbox-*.js runtime file.",
    })
  }
  return failures
}

export const iconPathsFromManifest = (manifest: WebManifest) =>
  (manifest.icons ?? []).map((icon) => icon.src.replace(/^\//, ""))
