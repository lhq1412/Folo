import { describe, expect, test } from "vitest"

import {
  checkBundleBudget,
  classifyRouteChunk,
  defaultBundleBudget,
  parseInitialAssets,
  routeChunksFromManifest,
} from "./bundle-report"

describe("bundle report", () => {
  test("collects initial module scripts, preloads, and stylesheets", () => {
    const html = `
      <script type="module" crossorigin src="/assets/index-abc.js"></script>
      <link rel="modulepreload" href="/assets/vendor-def.js">
      <link rel="stylesheet" href="/assets/index-abc.css">
    `

    expect(parseInitialAssets(html)).toEqual({
      js: ["/assets/index-abc.js", "/assets/vendor-def.js"],
      css: ["/assets/index-abc.css"],
    })
  })

  test("classifies lazy route chunks from source paths", () => {
    expect(classifyRouteChunk("src/features/auth/LoginPage.tsx")).toBe("login")
    expect(classifyRouteChunk("src/features/timeline/TimelinePage.tsx")).toBe("timeline")
    expect(classifyRouteChunk("src/features/reader/Reader.tsx")).toBe("timeline")
    expect(classifyRouteChunk("src/features/reader/ReaderPage.tsx")).toBe("timeline")
    expect(classifyRouteChunk("src/features/subscriptions/SubscriptionsPage.tsx")).toBe(
      "subscriptions",
    )
  })

  test("maps vite dynamic entries onto route chunk sizes", () => {
    const chunks = routeChunksFromManifest(
      {
        "src/features/auth/LoginPage.tsx": {
          file: "assets/LoginPage-aaa.js",
          isDynamicEntry: true,
          src: "src/features/auth/LoginPage.tsx",
        },
        "src/main.tsx": { file: "assets/index-bbb.js", isEntry: true },
        "../../node_modules/workbox-window/build/workbox-window.prod.es5.mjs": {
          file: "assets/workbox-window.js",
          isDynamicEntry: true,
          src: "../../node_modules/workbox-window/build/workbox-window.prod.es5.mjs",
        },
      },
      {
        "/assets/LoginPage-aaa.js": { gzipBytes: 1200, rawBytes: 3000 },
      },
    )

    expect(chunks).toEqual([
      {
        file: "assets/LoginPage-aaa.js",
        files: ["assets/LoginPage-aaa.js"],
        gzipBytes: 1200,
        id: "login",
        rawBytes: 3000,
        source: "src/features/auth/LoginPage.tsx",
      },
    ])
  })

  test("includes shared imported chunks in a lazy route's size", () => {
    const chunks = routeChunksFromManifest(
      {
        "src/features/timeline/TimelinePage.tsx": {
          file: "assets/TimelinePage.js",
          imports: ["_api.js", "index.html"],
          isDynamicEntry: true,
          src: "src/features/timeline/TimelinePage.tsx",
        },
        "_api.js": { file: "assets/api.js" },
        "index.html": { file: "assets/index.js", isEntry: true },
      },
      {
        "/assets/TimelinePage.js": { gzipBytes: 1000, rawBytes: 2000 },
        "/assets/api.js": { gzipBytes: 4000, rawBytes: 8000 },
        "/assets/index.js": { gzipBytes: 9000, rawBytes: 12_000 },
      },
    )

    expect(chunks).toEqual([
      {
        file: "assets/TimelinePage.js",
        files: ["assets/TimelinePage.js", "assets/api.js"],
        gzipBytes: 5000,
        id: "timeline",
        rawBytes: 10_000,
        source: "src/features/timeline/TimelinePage.tsx",
      },
    ])
  })

  test("fails over the hard gzip cap and over the recorded baseline", () => {
    const report = {
      initialCss: { files: ["a.css"], gzipBytes: 100, rawBytes: 200 },
      initialJs: { files: ["a.js"], gzipBytes: 260 * 1024, rawBytes: 400 * 1024 },
      routeChunks: [],
    }

    const failures = checkBundleBudget({
      baseline: { initialCssGzipBytes: 80, initialJsGzipBytes: 1000 },
      budget: defaultBundleBudget,
      report: {
        ...report,
        initialJs: { files: ["a.js"], gzipBytes: 20_000, rawBytes: 40_000 },
      },
    })

    expect(failures.map((item) => item.code)).toContain("initial-js-regression")
    expect(
      checkBundleBudget({
        report,
      }).map((item) => item.code),
    ).toContain("initial-js-budget")
  })
})
