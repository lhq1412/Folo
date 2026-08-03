import type { PrecacheManifestEntry } from "./precache-manifest-snapshot"

export const FOLLO_PRECACHE_MANIFEST_BOUNDARY = "folo-precache-manifest-boundary"
export const FOLLO_PRECACHE_MANIFEST_INJECTION_POINT = "self.__FOLO_PRECACHE_MANIFEST__"

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
