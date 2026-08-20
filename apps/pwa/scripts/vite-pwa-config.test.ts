import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, test } from "vitest"

describe("Folo Lite PWA config", () => {
  test("does not enable Workbox runtime caching for API responses", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      "utf8",
    )
    expect(source).not.toMatch(/runtimeCaching/)
    expect(source).toContain("navigateFallbackDenylist")
    expect(source).toContain("/^\\/api\\//")
    expect(source).toContain("/^\\/better-auth\\//")
  })
})
