import { afterEach, describe, expect, it, vi } from "vitest"

import { ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR, clearPwaRuntimeCaches } from "./cache-config"

describe("clearPwaRuntimeCaches", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("deletes legacy image-assets cache during cleanup", async () => {
    const deleted: string[] = []
    const cacheStore = new Map<string, Cache>()

    vi.stubGlobal("caches", {
      delete: vi.fn(async (cacheName: string) => {
        deleted.push(cacheName)
        return cacheStore.delete(cacheName)
      }),
    })

    await clearPwaRuntimeCaches()

    expect(deleted).toEqual(expect.arrayContaining([...ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR]))
    expect(deleted).toContain("image-assets")
  })
})
