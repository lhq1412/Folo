import { describe, expect, it } from "vitest"

import { getImageProxyUrl, IMAGE_PROXY_URL } from "./img-proxy"

describe("getImageProxyUrl", () => {
  it("does not wrap an existing Folo proxy URL", () => {
    const proxied = `${IMAGE_PROXY_URL}/?url=${encodeURIComponent("https://example.com/image.jpg")}`

    expect(getImageProxyUrl({ url: proxied, width: 720, canUseProxy: true })).toBe(proxied)
  })

  it("wraps an origin image URL once", () => {
    const origin = "https://example.com/image.jpg"
    const proxied = getImageProxyUrl({ url: origin, width: 720, canUseProxy: true })

    expect(new URL(proxied).searchParams.get("url")).toBe(origin)
  })
})
