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
const imageProxyUrl = (target: string) =>
  new URL(`https://img.folo.is/?url=${encodeURIComponent(target)}&width=700&height=`)

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

  it("routes common feed icon filename forms to feed icon cache", () => {
    const urls = [
      "https://cdn.example.com/avatar.png",
      "https://cdn.example.com/favicon.ico",
      "https://cdn.example.com/logo.svg",
      "https://cdn.example.com/icon-192.png",
      "https://cdn.example.com/icons/site.png",
      "https://cdn.example.com/avatars/user.png",
    ]

    for (const href of urls) {
      const url = new URL(href)
      expect(isFeedIconOrAvatar(url)).toBe(true)
      expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("feedIcons")
    }
  })

  it("does not route unrelated image filenames to feed icon cache", () => {
    const url = new URL("https://cdn.example.com/article/photo.jpg")

    expect(isFeedIconOrAvatar(url)).toBe(false)
    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("articleImages")
  })

  it("routes hashed asset images to same-origin static cache", () => {
    const url = new URL("https://app.folo.is/assets/logo-01234567abcdef.png")

    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("sameOriginStaticImages")
  })

  it("routes approved article images to article cache", () => {
    const url = new URL("https://cdn.example.com/article/photo.jpg")

    expect(shouldCacheAsArticleImage(url, ORIGIN)).toBe(true)
    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("articleImages")
  })

  it("routes safe image proxy requests from their nested path", () => {
    const article = imageProxyUrl("https://cdn.example.com/content/123")
    const icon = imageProxyUrl("https://cdn.example.com/icons/site")
    const proxiedStaticAsset = imageProxyUrl("https://app.folo.is/assets/logo-01234567abcdef.png")

    expect(isSafeRuntimeImageUrl(article)).toBe(true)
    expect(resolveRuntimeImageCacheRoute(article, ORIGIN)).toBe("articleImages")
    expect(resolveRuntimeImageCacheRoute(icon, ORIGIN)).toBe("feedIcons")
    expect(isSameOriginStaticImage(proxiedStaticAsset, ORIGIN)).toBe(false)
    expect(resolveRuntimeImageCacheRoute(proxiedStaticAsset, ORIGIN)).toBe("articleImages")
  })

  it("rejects malformed or unsafe image proxy requests", () => {
    const safeTarget = encodeURIComponent("https://cdn.example.com/image.jpg")
    const rejected = [
      "https://img.folo.is/",
      "https://img.folo.is/?url=not-a-url",
      `https://img.folo.is/?url=${safeTarget}&url=${safeTarget}`,
      `https://img.folo.is/resize?url=${safeTarget}`,
      `https://user:secret@img.folo.is/?url=${safeTarget}`,
      `https://img.folo.is/?url=${safeTarget}&token=secret`,
      `https://img.folo.is/?url=${encodeURIComponent("javascript:alert(1)")}`,
      `https://img.folo.is/?url=${encodeURIComponent("https://user:secret@cdn.example.com/image.jpg")}`,
      `https://img.folo.is/?url=${encodeURIComponent("https://cdn.example.com/api/image.jpg")}`,
      `https://img.folo.is/?url=${encodeURIComponent("https://cdn.example.com/private/image.jpg")}`,
      `https://img.folo.is/?url=${encodeURIComponent("https://cdn.example.com/pr%69vate/image.jpg")}`,
      `https://img.folo.is/?url=${encodeURIComponent("https://cdn.example.com/user/image.jpg")}`,
      `https://img.folo.is/?url=${encodeURIComponent("https://cdn.example.com/image.jpg?signature=secret")}`,
    ]

    for (const href of rejected) {
      expect(resolveRuntimeImageCacheRoute(new URL(href), ORIGIN)).toBeNull()
    }
  })

  it("routes cross-origin hashed asset images to article cache", () => {
    const url = new URL("https://cdn.example.com/assets/logo-01234567abcdef.png")

    expect(shouldCacheAsArticleImage(url, ORIGIN)).toBe(true)
    expect(resolveRuntimeImageCacheRoute(url, ORIGIN)).toBe("articleImages")
  })

  it("includes legacy runtime cache names in cleanup list", () => {
    expect(ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR).toEqual(
      expect.arrayContaining([...LEGACY_PWA_RUNTIME_CACHE_NAMES]),
    )
  })
})
