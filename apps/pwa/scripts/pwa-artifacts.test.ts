import { describe, expect, test } from "vitest"

import {
  requiredProductionFiles,
  validateServiceWorker,
  validateServiceWorkerRegistration,
  validateWebManifest,
} from "./pwa-artifacts"

describe("production PWA artifacts", () => {
  test("requires the installability shell files", () => {
    expect(
      requiredProductionFiles(["index.html", "manifest.webmanifest"]).map((item) => item.message),
    ).toEqual(
      expect.arrayContaining([
        "Production output is missing sw.js.",
        "Production output is missing a workbox-*.js runtime file.",
      ]),
    )
    expect(
      requiredProductionFiles(["index.html", "manifest.webmanifest", "sw.js", "workbox-abc.js"]),
    ).toEqual([])
  })

  test("accepts a standalone manifest and rejects missing icons", () => {
    expect(
      validateWebManifest({
        display: "standalone",
        icons: [{ src: "icon.svg" }],
        name: "Folo",
        start_url: "/",
      }),
    ).toEqual([])
    expect(
      validateWebManifest({ display: "browser", name: "Folo" }).map((item) => item.code),
    ).toEqual(expect.arrayContaining(["invalid-manifest"]))
  })

  test("rejects unresolved Workbox manifests and API runtime caches", () => {
    expect(validateServiceWorker("precacheAndRoute([{url:'/index.html'}]);")).toEqual([])
    expect(validateServiceWorker("self.__WB_MANIFEST").map((item) => item.code)).toContain(
      "service-worker",
    )
    expect(
      validateServiceWorker("precacheAndRoute([]); workbox.strategies.NetworkFirst();").map(
        (item) => item.code,
      ),
    ).toContain("api-cache")
    expect(
      validateServiceWorker("precacheAndRoute([]); https://api.folo.is").map((item) => item.code),
    ).toContain("api-cache")
  })

  test("requires a service worker registration helper in the app shell", () => {
    expect(validateServiceWorkerRegistration(["const x = 1"])).not.toEqual([])
    expect(validateServiceWorkerRegistration(["registerSW({ immediate: false })"])).toEqual([])
    expect(validateServiceWorkerRegistration(['new Workbox("/sw.js",{scope:"/"})'])).toEqual([])
    expect(validateServiceWorkerRegistration(["new Workbox(`/sw.js`,{scope:`/`})"])).toEqual([])
  })
})
