import { afterEach, describe, expect, it } from "vitest"

import {
  clearDeferredPwaUpdateForSession,
  deferPwaUpdateForSession,
  isPwaUpdateDeferredForSession,
} from "./update-coordinator"

describe("update-coordinator", () => {
  afterEach(() => {
    clearDeferredPwaUpdateForSession()
  })

  it("tracks deferred update state in session storage", () => {
    expect(isPwaUpdateDeferredForSession()).toBe(false)
    deferPwaUpdateForSession()
    expect(isPwaUpdateDeferredForSession()).toBe(true)
    clearDeferredPwaUpdateForSession()
    expect(isPwaUpdateDeferredForSession()).toBe(false)
  })
})
