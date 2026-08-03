import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

import { join } from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import {
  assertServiceWorkerFileExists,
  assertServiceWorkerManifestInjected,
} from "./validate-sw-manifest"

const tempDirs: string[] = []

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

describe("assertServiceWorkerManifestInjected", () => {
  it("passes when the manifest token is replaced with a non-empty precache array", () => {
    expect(() =>
      assertServiceWorkerManifestInjected(
        'precacheAndRoute([{url:"/index.html",revision:"abc123"}]);',
      ),
    ).not.toThrow()
  })

  it("passes for minified workbox precache injection", () => {
    expect(() =>
      assertServiceWorkerManifestInjected(
        'wt([{"revision":"abc123","url":"index.html"}]);yt();ue();',
      ),
    ).not.toThrow()
  })

  it("fails when __WB_MANIFEST remains in the built service worker", () => {
    expect(() =>
      assertServiceWorkerManifestInjected("precacheAndRoute(self.__WB_MANIFEST);"),
    ).toThrow(/__WB_MANIFEST was not injected/)
  })

  it("fails when precacheAndRoute receives an empty array", () => {
    expect(() => assertServiceWorkerManifestInjected("precacheAndRoute([]);")).toThrow(
      /precache manifest is empty/,
    )
  })

  it("fails when minified precache receives an empty array", () => {
    expect(() => assertServiceWorkerManifestInjected("wt([]);yt();")).toThrow(
      /precache manifest is empty/,
    )
  })

  it("fails when no precache manifest entries are present", () => {
    expect(() =>
      assertServiceWorkerManifestInjected("registerRoute(/./, new CacheFirst());"),
    ).toThrow(/no precache manifest entries found/)
  })
})
