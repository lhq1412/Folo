import {
  FOLLO_PRECACHE_MANIFEST_BOUNDARY,
  FOLLO_PRECACHE_MANIFEST_INJECTION_POINT,
} from "./precache-manifest-entries"

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

function isPrecacheManifestEntry(value: unknown): value is PrecacheManifestEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof (value as PrecacheManifestEntry).url === "string"
  )
}

export function extractActualPrecachePayload(swContent: string): PrecacheManifestEntry[] {
  if (swContent.includes(FOLLO_PRECACHE_MANIFEST_INJECTION_POINT)) {
    throw new Error(
      `Service worker build failed: ${FOLLO_PRECACHE_MANIFEST_INJECTION_POINT} was not injected.`,
    )
  }

  const anchor = `"${FOLLO_PRECACHE_MANIFEST_BOUNDARY}"`
  const anchorIndex = swContent.indexOf(anchor)
  if (anchorIndex === -1) {
    throw new Error(
      `Service worker build failed: precache boundary anchor "${FOLLO_PRECACHE_MANIFEST_BOUNDARY}" not found in sw.js.`,
    )
  }

  const beforeAnchor = swContent.slice(0, anchorIndex).trimEnd()
  const callEnd = beforeAnchor.lastIndexOf(")")
  if (callEnd === -1) {
    throw new Error("Service worker build failed: precache call not found before boundary anchor.")
  }

  let depth = 0
  let callStart = -1
  for (let index = callEnd; index >= 0; index--) {
    const char = beforeAnchor[index]
    if (char === ")") {
      depth++
    } else if (char === "(") {
      depth--
      if (depth === 0) {
        callStart = index
        break
      }
    }
  }

  if (callStart === -1) {
    throw new Error(
      "Service worker build failed: could not parse precache call before boundary anchor.",
    )
  }

  const args = beforeAnchor.slice(callStart + 1, callEnd).trim()
  if (!args.startsWith("[")) {
    throw new Error(
      "Service worker build failed: precache call argument is not an inline manifest array.",
    )
  }

  if (args === "[]") {
    return []
  }

  try {
    const parsed = JSON.parse(args) as unknown
    if (!Array.isArray(parsed)) {
      throw new TypeError("not an array")
    }

    return parsed.filter(isPrecacheManifestEntry)
  } catch {
    throw new Error("Service worker build failed: could not parse precache manifest array literal.")
  }
}

function normalizeManifestUrl(url: string): string {
  return url.startsWith("/") ? url.slice(1) : url
}

function normalizeRevision(revision: string | null | undefined): string | null {
  return revision ?? null
}

function findEntryRevision(
  payload: PrecacheManifestEntry[],
  url: string,
): string | null | undefined {
  const normalizedUrl = normalizeManifestUrl(url)

  return payload.find((entry) => normalizeManifestUrl(entry.url) === normalizedUrl)?.revision
}

export function findMissingPrecacheManifestEntries(
  swContent: string,
  entries: PrecacheManifestEntry[],
): string[] {
  const actualPayload = extractActualPrecachePayload(swContent)

  return entries
    .filter((entry) => typeof entry.url === "string" && entry.url.length > 0)
    .filter((entry) => {
      const actualRevision = findEntryRevision(actualPayload, entry.url)
      if (actualRevision === undefined) {
        return true
      }

      return normalizeRevision(actualRevision) !== normalizeRevision(entry.revision)
    })
    .map((entry) => entry.url)
}

export function assertPrecacheManifestInjectedIntoServiceWorker(
  swContent: string,
  entries: PrecacheManifestEntry[],
): void {
  const missingEntries = findMissingPrecacheManifestEntries(swContent, entries)

  if (missingEntries.length > 0) {
    const preview = missingEntries.slice(0, 5).join(", ")
    const suffix = missingEntries.length > 5 ? "..." : ""

    throw new Error(
      `Service worker build failed: precache call payload missing or mismatched for ${missingEntries.length} entries: ${preview}${suffix}`,
    )
  }
}
