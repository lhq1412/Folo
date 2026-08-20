// @vitest-environment jsdom

import { describe, expect, test } from "vitest"

import { sanitizeEntryContent, sanitizeSocialListContent } from "./sanitize"

describe("content sanitization", () => {
  test("removes interactive and positioned content from feeds", () => {
    const sanitized = sanitizeEntryContent(
      '<form action="https://evil.example"><input><button>Continue</button></form><p style="position:fixed;inset:0">Safe</p>',
    )

    expect(sanitized).not.toMatch(/<(?:button|form|input)|style=/)
    expect(sanitized).toContain("<p>Safe</p>")
  })

  test("keeps social text without loading or nesting interactive media", () => {
    const sanitized = sanitizeSocialListContent(
      '<p style="position:fixed">Hello <a href="https://evil.example">world</a></p><img src="https://evil.example/large.jpg"><video src="https://evil.example/video.mp4"></video><button>Continue</button>',
    )

    expect(sanitized).not.toMatch(/<(?:a|button|img|video)|style=/)
    expect(sanitized).toContain("<p>Hello world</p>")
  })
})
