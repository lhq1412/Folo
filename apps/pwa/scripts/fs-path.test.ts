import { describe, expect, test } from "vitest"

import { joinRoot, relativePosix } from "./fs-path"

describe("script path helpers", () => {
  test("joins and relativizes posix paths without node:path", () => {
    expect(joinRoot("/tmp/app", "dist", "index.html")).toBe("/tmp/app/dist/index.html")
    expect(relativePosix("/tmp/app/dist", "/tmp/app/dist/assets/index.js")).toBe("assets/index.js")
  })
})
