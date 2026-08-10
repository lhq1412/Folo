// @vitest-environment jsdom

import { describe, expect, test } from "vitest"

import { getNextPageParam, sanitizeEntryContent } from "./timeline"

describe("timeline pagination", () => {
  test("stops before requesting an incomplete next page", () => {
    expect(getNextPageParam({ data: [] })).toBeUndefined()
  })

  test("removes interactive and positioned content from feeds", () => {
    const sanitized = sanitizeEntryContent(
      '<form action="https://evil.example"><input><button>Continue</button></form><p style="position:fixed;inset:0">Safe</p>',
    )

    expect(sanitized).not.toMatch(/<(?:button|form|input)|style=/)
    expect(sanitized).toContain("<p>Safe</p>")
  })
})
