import { describe, expect, test } from "vitest"

import { PWA_RUNTIME_CACHE_NAMES } from "./cache-config"
import { liteRuntimeCaching } from "./runtime-caching"

describe("Lite Workbox runtime caching", () => {
  test("registers bounded image caches and never uses NetworkFirst", () => {
    expect(liteRuntimeCaching.map((item) => item.handler)).toEqual([
      "StaleWhileRevalidate",
      "CacheFirst",
      "CacheFirst",
    ])
    expect(liteRuntimeCaching.map((item) => item.options.cacheName)).toEqual([
      PWA_RUNTIME_CACHE_NAMES.feedIcons,
      PWA_RUNTIME_CACHE_NAMES.sameOriginStaticImages,
      PWA_RUNTIME_CACHE_NAMES.articleImages,
    ])
    for (const item of liteRuntimeCaching) {
      expect(item.options.expiration.purgeOnQuotaError).toBe(true)
      expect(item.options.expiration.maxEntries).toBeGreaterThan(0)
      expect(item.urlPattern.toString()).toContain("resolveLiteRuntimeImageCacheRoute")
      expect(item.urlPattern.toString()).not.toContain("api.folo.is")
      expect(item.urlPattern.toString()).not.toContain("api.follow.is")
    }
  })
})
