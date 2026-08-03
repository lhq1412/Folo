import { describe, expect, it } from "vitest"

import {
  ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR,
  hasSensitiveQueryParams,
  isFeedIconOrAvatar,
  isSafeRuntimeImageUrl,
  isSameOriginStaticImage,
  LEGACY_PWA_RUNTIME_CACHE_NAMES,
  resolveRuntimeImageCacheRoute,
  shouldCacheAsArticleImage,
} from "./cache-config"

const ORIGIN = "https://app.folo.is"

describe("cache-config", () => {
  it("detects sensitive query params case-insensitively", () => {
    const lowercase = new URL("https://cdn.example.com/image.png?signature=abc")
    const mixedCase = new URL("https://cdn.example.com/image.png?X-Amz-Signature=abc")

    expect(hasSensitiveQueryParams(lowercase)).toBe(true)
    expect(hasSensitiveQueryParams(mixedCase)).toBe(true)
  })

  it("rejects unsafe api avatar urls for every runtime cache route", () => {
    const url = new URL("https://app.folo.is/api/avatar.png?token=secret")

    expect(isSafeRuntimeImageUrl(url)).toBe(false)
    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBeNull()
  })

  it("rejects signed feed icon urls", () => {
    const url = new URL("https://cdn.example.com/avatar/user.png?token=secret")

    expect(isFeedIconOrAvatar(url)).toBe(false)
    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBeNull()
  })

  it("allows known same-origin static images only", () => {
    const allowed = new URL("https://app.folo.is/pwa-192x192.png")
    const rejected = new URL("https://app.folo.is/private/user/avatar.png")

    expect(isSameOriginStaticImage(allowed, ORIGIN)).toBe(true)
    expect(isSameOriginStaticImage(rejected, ORIGIN)).toBe(false)
  })

  it("prioritizes feed icon route before same-origin static route", () => {
    const url = new URL("https://app.folo.is/avatar/team.png")

    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("feedIcons")
  })

  it("routes hashed asset images to same-origin static cache", () => {
    const url = new URL("https://app.folo.is/assets/logo-01234567abcdef.png")

    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("sameOriginStaticImages")
  })

  it("routes approved article images to article cache", () => {
    const url = new URL("https://cdn.example.com/article/photo.jpg")

    expect(shouldCacheAsArticleImage(url)).toBe(true)
    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("articleImages")
  })

  it("includes legacy runtime cache names in cleanup list", () => {
    expect(ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR).toEqual(
      expect.arrayContaining([...LEGACY_PWA_RUNTIME_CACHE_NAMES]),
    )
  })
})
