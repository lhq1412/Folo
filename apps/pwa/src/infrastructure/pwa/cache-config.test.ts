import { describe, expect, test } from "vitest"

import {
  hasSensitiveQueryParams,
  isFeedIconOrAvatar,
  isSafeRuntimeImageUrl,
  isSameOriginStaticImage,
  matchArticleImageRequest,
  matchFeedIconImageRequest,
  matchSameOriginStaticImageRequest,
  PWA_RUNTIME_CACHE_NAMES,
  resolveLiteRuntimeImageCacheRoute,
  shouldCacheAsArticleImage,
} from "./cache-config"

const ORIGIN = "https://app.folo.is"
const imageRequest = { destination: "image" as const }
const otherRequest = { destination: "document" as const }

const proxy = (target: string) =>
  `https://img.folo.is?url=${encodeURIComponent(target)}&width=96&height=`

describe("Lite runtime image cache classification", () => {
  test("detects sensitive query params case-insensitively", () => {
    expect(
      hasSensitiveQueryParams(new URL("https://cdn.example.com/image.png?signature=abc")),
    ).toBe(true)
    expect(
      hasSensitiveQueryParams(new URL("https://cdn.example.com/image.png?X-Amz-Signature=abc")),
    ).toBe(true)
  })

  test("rejects API, auth, user, and signed image URLs", () => {
    const urls = [
      new URL("https://app.folo.is/api/avatar.png"),
      new URL("https://app.folo.is/better-auth/session"),
      new URL("https://cdn.example.com/avatar/user.png?token=secret"),
      new URL("https://cdn.example.com/private/user/photo.jpg"),
    ]

    for (const url of urls) {
      expect(resolveLiteRuntimeImageCacheRoute(url, url.origin === ORIGIN)).toBeNull()
    }
  })

  test("routes feed icons and avatars, including Lite image-proxy URLs", () => {
    const direct = new URL("https://cdn.example.com/avatars/user.png")
    const proxied = new URL(proxy("https://cdn.example.com/avatar.png"))

    expect(isFeedIconOrAvatar(direct)).toBe(true)
    expect(resolveLiteRuntimeImageCacheRoute(proxied, false)).toBe("feedIcons")
    expect(
      matchFeedIconImageRequest({ request: imageRequest, sameOrigin: false, url: proxied }),
    ).toBe(true)
  })

  test("routes same-origin hashed assets and Lite icons", () => {
    const hashed = new URL("https://app.folo.is/assets/logo-01234567abcdef.png")
    const icon = new URL("https://app.folo.is/icon-192x192.png")

    expect(isSameOriginStaticImage(hashed, ORIGIN)).toBe(true)
    expect(isSameOriginStaticImage(icon, ORIGIN)).toBe(true)
    expect(resolveLiteRuntimeImageCacheRoute(hashed, true)).toBe("sameOriginStaticImages")
    expect(
      matchSameOriginStaticImageRequest({ request: imageRequest, sameOrigin: true, url: icon }),
    ).toBe(true)
  })

  test("routes article and picture media, including proxy targets without extensions", () => {
    const photo = new URL("https://cdn.example.com/article/photo.jpg")
    const proxied = new URL(proxy("https://cdn.example.com/media/abc123"))

    expect(shouldCacheAsArticleImage(photo, ORIGIN)).toBe(true)
    expect(resolveLiteRuntimeImageCacheRoute(proxied, false)).toBe("articleImages")
    expect(
      matchArticleImageRequest({ request: imageRequest, sameOrigin: false, url: proxied }),
    ).toBe(true)
  })

  test("rejects unsafe or unparseable image-proxy targets", () => {
    expect(
      resolveLiteRuntimeImageCacheRoute(
        new URL(proxy("https://app.example.com/api/entry/1")),
        false,
      ),
    ).toBeNull()
    expect(
      resolveLiteRuntimeImageCacheRoute(
        new URL("https://img.folo.is?url=not-a-url&width=400"),
        false,
      ),
    ).toBeNull()
    expect(
      resolveLiteRuntimeImageCacheRoute(
        new URL(
          `https://img.folo.is?url=${encodeURIComponent("https://cdn.example.com/photo.jpg")}&token=secret`,
        ),
        false,
      ),
    ).toBeNull()
  })

  test("does not classify non-image requests", () => {
    const url = new URL("https://cdn.example.com/article/photo.jpg")
    expect(matchArticleImageRequest({ request: otherRequest, sameOrigin: false, url })).toBe(false)
    expect(isSafeRuntimeImageUrl(url)).toBe(true)
  })

  test("keeps Lite cache names distinct from the desktop PWA", () => {
    expect(PWA_RUNTIME_CACHE_NAMES.articleImages).toBe("folo-lite-article-images-v1")
    expect(PWA_RUNTIME_CACHE_NAMES.feedIcons).toMatch(/^folo-lite-/)
  })
})
