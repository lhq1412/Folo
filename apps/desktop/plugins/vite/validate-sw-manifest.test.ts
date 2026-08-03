import { describe, expect, it } from "vitest"

import { assertServiceWorkerManifestInjected } from "./validate-sw-manifest"

describe("assertServiceWorkerManifestInjected", () => {
  it("passes when the manifest token is replaced with a precache array", () => {
    expect(() =>
      assertServiceWorkerManifestInjected(
        'precacheAndRoute([{url:"/index.html",revision:"abc123"}]);',
      ),
    ).not.toThrow()
  })

  it("fails when __WB_MANIFEST remains in the built service worker", () => {
    expect(() =>
      assertServiceWorkerManifestInjected("precacheAndRoute(self.__WB_MANIFEST);"),
    ).toThrow(/__WB_MANIFEST was not injected/)
  })

  it("fails when precacheAndRoute is missing", () => {
    expect(() =>
      assertServiceWorkerManifestInjected("registerRoute(/./, new CacheFirst());"),
    ).toThrow(/precacheAndRoute call not found/)
  })
})
