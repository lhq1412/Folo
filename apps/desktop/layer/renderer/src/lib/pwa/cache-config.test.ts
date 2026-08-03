import { describe, expect, it } from "vitest"

import {
  hasSensitiveQueryParams,
  isFeedIconOrAvatar,
  isSameOriginStaticImage,
  shouldCacheAsArticleImage,
} from "./cache-config"

describe("cache-config", () => {
  it("detects sensitive query params", () => {
    const url = new URL("https://cdn.example.com/image.png?signature=abc")
    expect(hasSensitiveQueryParams(url)).toBe(true)
  })

  it("allows same-origin static images", () => {
    const url = new URL("https://app.folo.is/pwa-192x192.png")
    expect(isSameOriginStaticImage(url, "https://app.folo.is")).toBe(true)
  })

  it("detects feed icons and avatars", () => {
    const url = new URL("https://cdn.example.com/avatar/user.png")
    expect(isFeedIconOrAvatar(url)).toBe(true)
  })

  it("rejects signed article image urls", () => {
    const url = new URL("https://cdn.example.com/article/photo.jpg?token=secret")
    expect(shouldCacheAsArticleImage(url)).toBe(false)
  })

  it("allows approved article image urls", () => {
    const url = new URL("https://cdn.example.com/article/photo.jpg")
    expect(shouldCacheAsArticleImage(url)).toBe(true)
  })
})
