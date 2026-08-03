import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

import { join } from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import {
  assertPrecacheManifestInjectedIntoServiceWorker,
  assertPrecacheManifestSnapshot,
  resetPrecacheManifestSnapshot,
} from "./precache-manifest-snapshot"
import { assertServiceWorkerBuild, assertServiceWorkerFileExists } from "./validate-sw-manifest"

const tempDirs: string[] = []

afterEach(() => {
  resetPrecacheManifestSnapshot()
})

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("assertServiceWorkerFileExists", () => {
  it("passes when sw.js exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sw-manifest-"))
    tempDirs.push(directory)

    const swPath = join(directory, "sw.js")
    await writeFile(swPath, "precacheAndRoute([{url:'/index.html',revision:'abc'}]);", "utf8")

    expect(() => assertServiceWorkerFileExists(swPath)).not.toThrow()
  })

  it("fails when sw.js is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sw-manifest-"))
    tempDirs.push(directory)

    const swPath = join(directory, "sw.js")

    expect(() => assertServiceWorkerFileExists(swPath)).toThrow(/was not generated/)
  })
})

describe("assertPrecacheManifestSnapshot", () => {
  it("passes for a non-empty workbox manifest snapshot", () => {
    expect(() =>
      assertPrecacheManifestSnapshot([
        { url: "index.html", revision: "abc123" },
        { url: "/sw.js?pwa=true", revision: null },
      ]),
    ).not.toThrow()
  })

  it("fails when the snapshot is empty", () => {
    expect(() => assertPrecacheManifestSnapshot([])).toThrow(/snapshot is empty or missing/)
  })
})

describe("assertPrecacheManifestInjectedIntoServiceWorker", () => {
  it("passes when snapshot urls are present in sw.js", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        'xt([{"revision":"abc123","url":"index.html"}]);',
        [{ url: "index.html", revision: "abc123" }],
      ),
    ).not.toThrow()
  })

  it("fails when snapshot urls are missing from sw.js", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        'const runtimeRoutes=[{url:"/api"}];xt([]);',
        [{ url: "index.html", revision: "abc123" }],
      ),
    ).toThrow(/were not injected into sw\.js/)
  })
})

describe("assertServiceWorkerBuild", () => {
  it("passes when snapshot and injected sw.js agree", () => {
    expect(() =>
      assertServiceWorkerBuild({
        swContent: 'xt([{"revision":"abc123","url":"index.html"}]);',
        precacheManifest: [{ url: "index.html", revision: "abc123" }],
      }),
    ).not.toThrow()
  })

  it("fails when __WB_MANIFEST remains in the built service worker", () => {
    expect(() =>
      assertServiceWorkerBuild({
        swContent: "precacheAndRoute(self.__WB_MANIFEST);",
        precacheManifest: [{ url: "index.html", revision: "abc123" }],
      }),
    ).toThrow(/__WB_MANIFEST was not injected/)
  })

  it("fails when precache snapshot is empty even if unrelated runtime url arrays exist", () => {
    expect(() =>
      assertServiceWorkerBuild({
        swContent: 'const runtimeRoutes=[{url:"/api"}];function mt(n){self.precache(n)}xt([]);',
        precacheManifest: [],
      }),
    ).toThrow(/snapshot is empty or missing/)
  })

  it("fails when unrelated runtime url arrays exist but injected manifest urls are missing", () => {
    expect(() =>
      assertServiceWorkerBuild({
        swContent: 'const runtimeRoutes=[{url:"/api"}];xt([]);',
        precacheManifest: [{ url: "index.html", revision: "abc123" }],
      }),
    ).toThrow(/were not injected into sw\.js/)
  })
})
