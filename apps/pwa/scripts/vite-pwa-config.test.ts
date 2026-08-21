import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

import { PWA_RUNTIME_CACHE_NAMES } from "../src/infrastructure/pwa/cache-config"
import { liteRuntimeCaching } from "../src/infrastructure/pwa/runtime-caching"

describe("Folo Lite PWA config", () => {
  test("registers bounded image runtime caches and keeps API/auth on the network", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      "utf8",
    )
    expect(source).toContain("runtimeCaching")
    expect(source).toContain("liteRuntimeCaching")
    expect(source).not.toMatch(/NetworkFirst/)
    expect(source).toContain("navigateFallbackDenylist")
    expect(source).toContain("/^\\/api\\//")
    expect(source).toContain("/^\\/better-auth\\//")
    expect(liteRuntimeCaching).toHaveLength(3)
    expect(liteRuntimeCaching.some((item) => item.handler === "NetworkFirst")).toBe(false)
    expect(liteRuntimeCaching.map((item) => item.options.cacheName)).toEqual(
      expect.arrayContaining(Object.values(PWA_RUNTIME_CACHE_NAMES)),
    )
  })
})
