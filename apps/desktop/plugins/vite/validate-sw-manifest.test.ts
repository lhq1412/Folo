import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

import { join } from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import { FOLLO_PRECACHE_MANIFEST_BOUNDARY } from "./precache-manifest-entries"
import {
  assertPrecacheManifestInjectedIntoServiceWorker,
  assertPrecacheManifestSnapshot,
  extractActualPrecachePayload,
  resetPrecacheManifestSnapshot,
} from "./precache-manifest-snapshot"
import {
  assertPwaBuildRevisionResponder,
  assertServiceWorkerBuild,
  assertServiceWorkerFileExists,
} from "./validate-sw-manifest"

const tempDirs: string[] = []

const boundaryAnchor = `("${FOLLO_PRECACHE_MANIFEST_BOUNDARY}")`
const revisionResponderSnippet =
  'addEventListener("message",(e)=>{if(e.data?.type!=="folo-pwa-build-revision-request-v1")return;e.ports[0]?.postMessage({type:"folo-pwa-build-revision-response-v1",revision:"1.0.0-abc"})});'

const swWithRevisionResponder = (body: string) => `${body}${revisionResponderSnippet}`

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

describe("extractActualPrecachePayload", () => {
  it("extracts the inline array passed to the precache call before the boundary anchor", () => {
    const payload = extractActualPrecachePayload(
      `xt([{"revision":"abc","url":"index.html"},{"revision":null,"url":"/sw.js?pwa=true"}]);${boundaryAnchor};`,
    )

    expect(payload).toEqual([
      { revision: "abc", url: "index.html" },
      { revision: null, url: "/sw.js?pwa=true" },
    ])
  })

  it("returns an empty array when the precache call receives []", () => {
    expect(
      extractActualPrecachePayload(
        `const unusedManifest=[{"revision":"abc","url":"index.html"}];xt([]);${boundaryAnchor};`,
      ),
    ).toEqual([])
  })
})

describe("assertPrecacheManifestInjectedIntoServiceWorker", () => {
  it("passes when every snapshot entry matches the actual precache payload", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        `xt([{"revision":"abc123","url":"index.html"},{"revision":null,"url":"/sw.js?pwa=true"}]);${boundaryAnchor};`,
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
        `xt([{"revision":"abc123","url":"index.html"}]);${boundaryAnchor};`,
        [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
      ),
    ).toThrow(/\/sw\.js\?pwa=true/)
  })

  it("fails when /sw.js?pwa=true is missing from the precache payload", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        `xt([{"revision":"abc123","url":"index.html"}]);${boundaryAnchor};`,
        [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
      ),
    ).toThrow(/\/sw\.js\?pwa=true/)
  })

  it("fails when a full manifest exists in an unrelated variable but precache receives []", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        `const unusedManifest=[{"revision":"abc123","url":"index.html"},{"revision":null,"url":"/sw.js?pwa=true"}];xt([]);${boundaryAnchor};`,
        [
          { url: "index.html", revision: "abc123" },
          { url: "/sw.js?pwa=true", revision: null },
        ],
      ),
    ).toThrow(/missing or mismatched/)
  })

  it("fails when the url matches but revision is stale", () => {
    expect(() =>
      assertPrecacheManifestInjectedIntoServiceWorker(
        `xt([{"revision":"stale","url":"index.html"}]);${boundaryAnchor};`,
        [{ url: "index.html", revision: "abc123" }],
      ),
    ).toThrow(/index\.html/)
  })
})

describe("assertServiceWorkerBuild", () => {
  it("passes when snapshot and injected sw.js agree", () => {
    expect(() =>
      assertServiceWorkerBuild({
        swContent: swWithRevisionResponder(
          `xt([{"revision":"abc123","url":"index.html"},{"revision":null,"url":"/sw.js?pwa=true"}]);${boundaryAnchor};`,
        ),
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
    ).toThrow(/boundary anchor/)
  })

  it("fails when precache snapshot is empty even if unrelated runtime url arrays exist", () => {
    expect(() =>
      assertServiceWorkerBuild({
        swContent: `const runtimeRoutes=[{url:"/api"}];function mt(n){self.precache(n)}xt([]);${boundaryAnchor};`,
        precacheManifest: [],
      }),
    ).toThrow(/snapshot is empty or missing/)
  })
})

describe("assertPwaBuildRevisionResponder", () => {
  it("passes when sw.js includes the revision request/response protocol", () => {
    expect(() => assertPwaBuildRevisionResponder(revisionResponderSnippet)).not.toThrow()
  })

  it("fails when the revision request handler is missing", () => {
    expect(() =>
      assertPwaBuildRevisionResponder(revisionResponderSnippet.replace("request-v1", "missing")),
    ).toThrow(/revision-request-v1 handler is missing/)
  })

  it("fails when the revision value is not injected", () => {
    expect(() =>
      assertPwaBuildRevisionResponder(
        'addEventListener("message",(e)=>{if(e.data?.type!=="folo-pwa-build-revision-request-v1")return;e.ports[0]?.postMessage({type:"folo-pwa-build-revision-response-v1"})});',
      ),
    ).toThrow(/revision injection is missing/)
  })
})
