export type PrecacheManifestEntry = {
  revision?: string | null
  url: string
}

let precacheManifestSnapshot: PrecacheManifestEntry[] | null = null

export function setPrecacheManifestSnapshot(entries: PrecacheManifestEntry[]): void {
  precacheManifestSnapshot = entries
}

export function consumePrecacheManifestSnapshot(): PrecacheManifestEntry[] | null {
  const snapshot = precacheManifestSnapshot
  precacheManifestSnapshot = null
  return snapshot
}

export function resetPrecacheManifestSnapshot(): void {
  precacheManifestSnapshot = null
}

export function assertPrecacheManifestSnapshot(
  entries: PrecacheManifestEntry[] | null,
): asserts entries is PrecacheManifestEntry[] {
  if (!entries || entries.length === 0) {
    throw new Error("Service worker build failed: precache manifest snapshot is empty or missing.")
  }

  const urls = entries
    .map((entry) => entry.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0)

  if (urls.length === 0) {
    throw new Error("Service worker build failed: precache manifest has no url entries.")
  }
}

const WORKBOX_MANIFEST_ENTRY_PATTERNS = [
  /\{\s*"revision"\s*:\s*(?:"[^"]*"|null)\s*,\s*"url"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g,
  /\{\s*"url"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"revision"\s*:\s*(?:"[^"]*"|null)\s*\}/g,
] as const

export function extractWorkboxPrecacheUrls(swContent: string): Set<string> {
  const urls = new Set<string>()

  for (const pattern of WORKBOX_MANIFEST_ENTRY_PATTERNS) {
    for (const match of swContent.matchAll(pattern)) {
      const url = match[1]?.replaceAll(String.raw`\"`, '"')
      if (url) {
        urls.add(url)
      }
    }
  }

  return urls
}

function normalizeManifestUrl(url: string): string {
  return url.startsWith("/") ? url.slice(1) : url
}

function precachePayloadIncludesUrl(precacheUrls: Set<string>, url: string): boolean {
  const candidates = new Set<string>([url, normalizeManifestUrl(url)])
  if (!url.startsWith("/")) {
    candidates.add(`/${url}`)
  }

  for (const candidate of candidates) {
    if (precacheUrls.has(candidate) || precacheUrls.has(normalizeManifestUrl(candidate))) {
      return true
    }
  }

  return false
}

export function findMissingPrecacheManifestUrls(
  swContent: string,
  entries: PrecacheManifestEntry[],
): string[] {
  const precacheUrls = extractWorkboxPrecacheUrls(swContent)

  return entries
    .map((entry) => entry.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .filter((url) => !precachePayloadIncludesUrl(precacheUrls, url))
}

export function assertPrecacheManifestInjectedIntoServiceWorker(
  swContent: string,
  entries: PrecacheManifestEntry[],
): void {
  const missingUrls = findMissingPrecacheManifestUrls(swContent, entries)

  if (missingUrls.length > 0) {
    const preview = missingUrls.slice(0, 5).join(", ")
    const suffix = missingUrls.length > 5 ? "..." : ""

    throw new Error(
      `Service worker build failed: precache manifest missing ${missingUrls.length} entries in sw.js payload: ${preview}${suffix}`,
    )
  }
}
