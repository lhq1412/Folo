import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

import { join } from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import {
  assertPrecacheManifestInjectedIntoServiceWorker,
  assertPrecacheManifestSnapshot,
  extractWorkboxPrecacheUrls,
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

describe("extractWorkboxPrecacheUrls", () => {
  it("extracts urls only from workbox manifest payload objects", () => {
    const urls = extractWorkboxPrecacheUrls(
      'const runtimeRoutes=[{url:"/api"}];xt([{"revision":"abc","url":"index.html"},{"revision":null,"url":"/sw.js?pwa=true"}]);',
    )

    expect(urls).toEqual(new Set(["index.html", "/sw.js?pwa=true"]))
  })
})

describe("assertPrecacheManifestInjectedIntoServiceWorker", () => {
  it("passes when every snapshot url exists in the precache payload", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        'xt([{"revision":"abc123","url":"index.html"},{"revision":null,"url":"/sw.js?pwa=true"}]);',
        [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
      ),
    ).not.toThrow()
  })

  it("fails when only one of two snapshot urls is present in the precache payload", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        'xt([{"revision":"abc123","url":"index.html"}]);',
        [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
      ),
    ).toThrow(/missing 1 entries/)
  })

  it("fails when /sw.js?pwa=true is missing from the precache payload", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        'xt([{"revision":"abc123","url":"index.html"}]);',
        [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
      ),
    ).toThrow(/\/sw\.js\?pwa=true/)
  })

  it("fails when urls only appear in unrelated code", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        'const runtimeRoutes=[{url:"/api"}];const x="index.html";const y="/sw.js?pwa=true";xt([]);',
        [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
      ),
    ).toThrow(/missing 2 entries/)
  })
})

describe("assertServiceWorkerBuild", () => {
  it("passes when snapshot and injected sw.js agree", () => {
    expect(() =>
      assertServiceWorkerBuild({
        swContent:
          'xt([{"revision":"abc123","url":"index.html"},{"revision":null,"url":"/sw.js?pwa=true"}]);',
        precacheManifest: [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
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
})
