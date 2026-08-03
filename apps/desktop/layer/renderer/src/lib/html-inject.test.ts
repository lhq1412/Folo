import { describe, expect, test } from "vitest"

import { MOBILE_MEDIA_QUERY } from "../../../../../../packages/internal/components/src/constants/viewport"
import { injectViewportBootstrap } from "../../../../plugins/vite/html-inject"

describe("htmlInjectPlugin viewport bootstrap", () => {
  test("injects shared mobile media query into index html", () => {
    const html = "<html><!-- FOLLOW VIEWPORT BOOTSTRAP INJECT --></html>"
    const result = injectViewportBootstrap(html)

    expect(result).toContain(`window.matchMedia(${JSON.stringify(MOBILE_MEDIA_QUERY)})`)
  })
})
