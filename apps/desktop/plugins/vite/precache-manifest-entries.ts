import type { PrecacheManifestEntry } from "./precache-manifest-snapshot"

export const PRECACHE_ADDITIONAL_MANIFEST_ENTRIES = [
  {
    url: "/sw.js?pwa=true",
    revision: null,
  },
] satisfies PrecacheManifestEntry[]

export function buildExpectedPrecacheManifest(
  manifest: PrecacheManifestEntry[],
): PrecacheManifestEntry[] {
  return [...manifest, ...PRECACHE_ADDITIONAL_MANIFEST_ENTRIES]
}
