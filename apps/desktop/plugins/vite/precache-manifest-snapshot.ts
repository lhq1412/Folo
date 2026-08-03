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

function serviceWorkerIncludesManifestUrl(swContent: string, url: string): boolean {
  const candidates = new Set<string>([url])
  if (url.startsWith("/")) {
    candidates.add(url.slice(1))
  } else {
    candidates.add(`/${url}`)
  }

  for (const candidate of candidates) {
    if (swContent.includes(`"${candidate}"`)) {
      return true
    }
  }

  return false
}

export function assertPrecacheManifestInjectedIntoServiceWorker(
  swContent: string,
  entries: PrecacheManifestEntry[],
): void {
  const injectedUrlCount = entries
    .map((entry) => entry.url)
    .filter((url) => serviceWorkerIncludesManifestUrl(swContent, url)).length

  if (injectedUrlCount === 0) {
    throw new Error(
      "Service worker build failed: precache manifest snapshot urls were not injected into sw.js.",
    )
  }
}
