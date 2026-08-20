import { gzipSync } from "node:zlib"

export const INITIAL_JS_GZIP_BUDGET_BYTES = 250 * 1024
export const INITIAL_CSS_GZIP_BUDGET_BYTES = 50 * 1024

export type AssetSize = {
  files: string[]
  rawBytes: number
  gzipBytes: number
}

export type RouteChunkSize = {
  id: string
  file: string
  source: string
  files: string[]
  rawBytes: number
  gzipBytes: number
}

export type BundleReport = {
  initialJs: AssetSize
  initialCss: AssetSize
  routeChunks: RouteChunkSize[]
}

export type BundleBudget = {
  initialJsGzipBytes: number
  initialCssGzipBytes: number
  baselineRegression: {
    maxIncreaseBytes: number
    maxIncreaseRatio: number
  }
}

export type BundleBaseline = {
  measuredAt: string
  command: string
  gzip: string
  initialAssets: string
  initialJsGzipBytes: number
  initialCssGzipBytes: number
  routeChunks: Array<{ id: string; gzipBytes: number }>
}

export type BudgetFailure = {
  code:
    "initial-js-budget" | "initial-css-budget" | "initial-js-regression" | "initial-css-regression"
  message: string
}

export const defaultBundleBudget: BundleBudget = {
  initialJsGzipBytes: INITIAL_JS_GZIP_BUDGET_BYTES,
  initialCssGzipBytes: INITIAL_CSS_GZIP_BUDGET_BYTES,
  baselineRegression: {
    maxIncreaseBytes: 8 * 1024,
    maxIncreaseRatio: 0.05,
  },
}

export const gzipSize = (buffer: Uint8Array) => gzipSync(buffer).byteLength

const unique = (values: string[]) => [...new Set(values)]

export const parseInitialAssets = (html: string) => {
  const js: string[] = []
  const css: string[] = []

  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    const src = match[1]?.split("?")[0]
    if (src) js.push(src)
  }

  for (const match of html.matchAll(/<link[^>]*>/gi)) {
    const tag = match[0]
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]?.split("?")[0]
    if (!rel || !href) continue

    const rels = rel.toLowerCase().split(/\s+/)
    if (rels.includes("stylesheet") || (rels.includes("preload") && href.endsWith(".css"))) {
      css.push(href)
    }
    if ((rels.includes("modulepreload") || rels.includes("preload")) && href.endsWith(".js")) {
      js.push(href)
    }
  }

  return { js: unique(js), css: unique(css) }
}

export const classifyRouteChunk = (source: string) => {
  if (source.includes("/features/auth/")) return "login"
  if (source.includes("/features/timeline/") || source.includes("/features/reader/")) {
    return "timeline"
  }
  if (source.includes("SubscriptionsPage")) return "subscriptions"
  if (source.includes("DiscoverPage")) return "discover"
  if (source.includes("SettingsPage")) return "settings"
  return "other"
}

export type ViteManifestEntry = {
  file: string
  src?: string
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: string[]
}

const assetSize = (file: string, sizes: Record<string, { rawBytes: number; gzipBytes: number }>) =>
  sizes[`/${file}`] ?? sizes[file]

const collectImportedFiles = (
  key: string,
  manifest: Record<string, ViteManifestEntry>,
  seen: Set<string>,
) => {
  if (seen.has(key)) return []
  seen.add(key)
  const entry = manifest[key]
  if (!entry || entry.isEntry) return []
  const files = [entry.file]
  for (const dep of entry.imports ?? []) {
    files.push(...collectImportedFiles(dep, manifest, seen))
  }
  return files
}

export const routeChunksFromManifest = (
  manifest: Record<string, ViteManifestEntry>,
  sizes: Record<string, { rawBytes: number; gzipBytes: number }>,
) => {
  const chunks: RouteChunkSize[] = []

  for (const [source, entry] of Object.entries(manifest)) {
    if (!entry.isDynamicEntry || !entry.file) continue
    const sourcePath = entry.src ?? source
    if (sourcePath.includes("node_modules")) continue
    const files = collectImportedFiles(source, manifest, new Set())
    const totals = files.reduce(
      (sum, file) => {
        const size = assetSize(file, sizes)
        if (!size) return sum
        return { gzipBytes: sum.gzipBytes + size.gzipBytes, rawBytes: sum.rawBytes + size.rawBytes }
      },
      { gzipBytes: 0, rawBytes: 0 },
    )
    if (totals.gzipBytes === 0) continue
    chunks.push({
      file: entry.file,
      files,
      gzipBytes: totals.gzipBytes,
      id: classifyRouteChunk(sourcePath),
      rawBytes: totals.rawBytes,
      source: sourcePath,
    })
  }

  return chunks.sort((left, right) => left.source.localeCompare(right.source))
}

export const allowedIncrease = (baselineBytes: number, budget: BundleBudget) =>
  Math.max(
    budget.baselineRegression.maxIncreaseBytes,
    Math.ceil(baselineBytes * budget.baselineRegression.maxIncreaseRatio),
  )

export const checkBundleBudget = ({
  report,
  budget = defaultBundleBudget,
  baseline,
}: {
  report: BundleReport
  budget?: BundleBudget
  baseline?: Pick<BundleBaseline, "initialJsGzipBytes" | "initialCssGzipBytes">
}) => {
  const failures: BudgetFailure[] = []

  if (report.initialJs.gzipBytes > budget.initialJsGzipBytes) {
    failures.push({
      code: "initial-js-budget",
      message: `Initial JS gzip ${report.initialJs.gzipBytes} B exceeds budget ${budget.initialJsGzipBytes} B (250 KiB).`,
    })
  }

  if (report.initialCss.gzipBytes > budget.initialCssGzipBytes) {
    failures.push({
      code: "initial-css-budget",
      message: `Initial CSS gzip ${report.initialCss.gzipBytes} B exceeds budget ${budget.initialCssGzipBytes} B (50 KiB).`,
    })
  }

  if (baseline) {
    const jsLimit =
      baseline.initialJsGzipBytes + allowedIncrease(baseline.initialJsGzipBytes, budget)
    if (report.initialJs.gzipBytes > jsLimit) {
      failures.push({
        code: "initial-js-regression",
        message: `Initial JS gzip grew from ${baseline.initialJsGzipBytes} B to ${report.initialJs.gzipBytes} B (limit ${jsLimit} B). Update performance/baseline.json only with an explanation in PERFORMANCE.md.`,
      })
    }

    const cssLimit =
      baseline.initialCssGzipBytes + allowedIncrease(baseline.initialCssGzipBytes, budget)
    if (report.initialCss.gzipBytes > cssLimit) {
      failures.push({
        code: "initial-css-regression",
        message: `Initial CSS gzip grew from ${baseline.initialCssGzipBytes} B to ${report.initialCss.gzipBytes} B (limit ${cssLimit} B). Update performance/baseline.json only with an explanation in PERFORMANCE.md.`,
      })
    }
  }

  return failures
}

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KiB`
}

export const formatBundleSummary = (report: BundleReport) => {
  const lines = [
    `Initial JS  raw ${formatBytes(report.initialJs.rawBytes)}  gzip ${formatBytes(report.initialJs.gzipBytes)}`,
    ...report.initialJs.files.map((file) => `  ${file}`),
    `Initial CSS raw ${formatBytes(report.initialCss.rawBytes)}  gzip ${formatBytes(report.initialCss.gzipBytes)}`,
    ...report.initialCss.files.map((file) => `  ${file}`),
    "Route chunks:",
    ...report.routeChunks.map((chunk) => {
      const extras = chunk.files.filter((file) => file !== chunk.file)
      const extraNote = extras.length > 0 ? ` + ${extras.join(", ")}` : ""
      return `  ${chunk.id.padEnd(14)} gzip ${formatBytes(chunk.gzipBytes).padStart(8)}  ${chunk.file}${extraNote}`
    }),
  ]
  return lines.join("\n")
}
