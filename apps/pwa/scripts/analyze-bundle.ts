import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"

import type { BundleBaseline, BundleReport, ViteManifestEntry } from "./bundle-report.ts"
import {
  checkBundleBudget,
  defaultBundleBudget,
  formatBundleSummary,
  gzipSize,
  parseInitialAssets,
  routeChunksFromManifest,
} from "./bundle-report.ts"
import { appRootFromScript, joinRoot, relativePosix } from "./fs-path.ts"

const appRoot = appRootFromScript(import.meta.url)
const distDir = joinRoot(appRoot, "dist")
const performanceDir = joinRoot(appRoot, "performance")
const reportPath = joinRoot(performanceDir, "bundle-report.json")
const baselinePath = joinRoot(performanceDir, "baseline.json")

const args = new Set(process.argv.slice(2))

const walkFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = joinRoot(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)))
      continue
    }
    files.push(fullPath)
  }
  return files
}

const readAssetSizes = async () => {
  const sizes: Record<string, { rawBytes: number; gzipBytes: number }> = {}
  for (const filePath of await walkFiles(distDir)) {
    const buffer = await readFile(filePath)
    const urlPath = `/${relativePosix(distDir, filePath)}`
    sizes[urlPath] = { gzipBytes: gzipSize(buffer), rawBytes: buffer.byteLength }
    sizes[urlPath.slice(1)] = sizes[urlPath]
  }
  return sizes
}

const sumAssets = (
  paths: string[],
  sizes: Record<string, { rawBytes: number; gzipBytes: number }>,
) =>
  paths.reduce(
    (total, file) => {
      const size = sizes[file] ?? sizes[file.replace(/^\//, "")]
      if (!size) {
        throw new Error(`Initial asset is missing from dist: ${file}`)
      }
      return {
        files: [...total.files, file],
        gzipBytes: total.gzipBytes + size.gzipBytes,
        rawBytes: total.rawBytes + size.rawBytes,
      }
    },
    { files: [] as string[], gzipBytes: 0, rawBytes: 0 },
  )

const loadViteManifest = async () => {
  try {
    const text = await readFile(joinRoot(distDir, ".vite/manifest.json"), "utf8")
    return JSON.parse(text) as Record<string, ViteManifestEntry>
  } catch {
    return null
  }
}

const loadBaseline = async () => {
  try {
    return JSON.parse(await readFile(baselinePath, "utf8")) as BundleBaseline
  } catch {
    return null
  }
}

const toBaseline = (report: BundleReport): BundleBaseline => ({
  command: "pnpm --dir apps/pwa build && pnpm --dir apps/pwa analyze:bundle",
  gzip: "node:zlib gzipSync default level",
  initialAssets: "script[src], link[rel=modulepreload], link[rel=stylesheet] in dist/index.html",
  initialCssGzipBytes: report.initialCss.gzipBytes,
  initialJsGzipBytes: report.initialJs.gzipBytes,
  measuredAt: new Date().toISOString().slice(0, 10),
  routeChunks: report.routeChunks.map((chunk) => ({ gzipBytes: chunk.gzipBytes, id: chunk.id })),
})

const buildReport = async (): Promise<BundleReport> => {
  const indexHtml = await readFile(joinRoot(distDir, "index.html"), "utf8").catch(() => {
    throw new Error("dist/index.html is missing. Run `pnpm --dir apps/pwa build` first.")
  })
  const sizes = await readAssetSizes()
  const initial = parseInitialAssets(indexHtml)
  const manifest = await loadViteManifest()

  return {
    initialCss: sumAssets(initial.css, sizes),
    initialJs: sumAssets(initial.js, sizes),
    routeChunks: manifest ? routeChunksFromManifest(manifest, sizes) : [],
  }
}

const report = await buildReport()
await mkdir(performanceDir, { recursive: true })
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(formatBundleSummary(report))
console.log(`Wrote ${relativePosix(appRoot, reportPath)}`)

if (args.has("--write-baseline")) {
  await writeFile(baselinePath, `${JSON.stringify(toBaseline(report), null, 2)}\n`)
  console.log(`Wrote ${relativePosix(appRoot, baselinePath)}`)
}

if (args.has("--check")) {
  const baseline = await loadBaseline()
  if (!baseline) {
    throw new Error(
      "performance/baseline.json is missing. Run `pnpm --dir apps/pwa analyze:bundle -- --write-baseline` after a production build.",
    )
  }
  const failures = checkBundleBudget({
    baseline,
    budget: defaultBundleBudget,
    report,
  })
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`[${failure.code}] ${failure.message}`)
    }
    process.exitCode = 1
  } else {
    console.log("Bundle budget check passed.")
  }
}
