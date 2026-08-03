import { MOBILE_MEDIA_QUERY } from "@follow/components/constants/viewport"
import { describe, expect, test } from "vitest"

import { htmlInjectPlugin } from "../../../../plugins/vite/html-inject"

describe("htmlInjectPlugin viewport bootstrap", () => {
  test("injects shared mobile media query into index html", () => {
    const plugin = htmlInjectPlugin({} as never)
    const transform = plugin.transformIndexHtml

    expect(typeof transform).toBe("function")
    if (typeof transform !== "function") {
      return
    }

    const html = "<html><!-- FOLLOW VIEWPORT BOOTSTRAP INJECT --></html>"
    const result = transform(html)

    expect(result).toContain(`window.matchMedia(${JSON.stringify(MOBILE_MEDIA_QUERY)})`)
  })
})
