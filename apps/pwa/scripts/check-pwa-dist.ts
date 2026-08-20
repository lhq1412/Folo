import { readdir, readFile, stat } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { appRootFromScript, joinRoot } from "./fs-path.ts"
import type { ArtifactFailure, WebManifest } from "./pwa-artifacts.ts"
import {
  iconPathsFromManifest,
  requiredProductionFiles,
  validateServiceWorker,
  validateServiceWorkerRegistration,
  validateWebManifest,
} from "./pwa-artifacts.ts"

const appRoot = appRootFromScript(import.meta.url)
const distDir = joinRoot(appRoot, "dist")
const smokeRoutes = ["/", "/login", "/entries/sample-id", "/subscriptions", "/settings"]

const fileExists = async (filePath: string) => {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

const contentType = (filePath: string) => {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8"
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8"
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8"
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json"
  if (filePath.endsWith(".png")) return "image/png"
  if (filePath.endsWith(".svg")) return "image/svg+xml"
  return "application/octet-stream"
}

const resolveDistFile = async (pathname: string) => {
  const relativePath = decodeURIComponent(pathname).replace(/^\//, "")
  const candidate = joinRoot(distDir, relativePath || "index.html")
  if (!candidate.startsWith(distDir)) return joinRoot(distDir, "index.html")
  if (await fileExists(candidate)) {
    const info = await stat(candidate)
    if (info.isDirectory()) return joinRoot(candidate, "index.html")
    return candidate
  }
  return joinRoot(distDir, "index.html")
}

const startStaticServer = async () => {
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname
      const filePath = await resolveDistFile(pathname)
      const body = await readFile(filePath)
      response.writeHead(200, { "content-type": contentType(filePath) })
      response.end(body)
    })().catch(() => {
      response.writeHead(500)
      response.end("Internal Server Error")
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address() as AddressInfo
  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    port: address.port,
  }
}

const reportFailures = (failures: ArtifactFailure[]) => {
  for (const failure of failures) {
    console.error(`[${failure.code}] ${failure.message}`)
  }
}

const failures: ArtifactFailure[] = []

if (!(await fileExists(joinRoot(distDir, "index.html")))) {
  failures.push({
    code: "missing-file",
    message: "dist/index.html is missing. Run `pnpm --dir apps/pwa build` first.",
  })
} else {
  const distNames = await readdir(distDir)
  failures.push(...requiredProductionFiles(distNames))

  const manifest = JSON.parse(
    await readFile(joinRoot(distDir, "manifest.webmanifest"), "utf8"),
  ) as WebManifest
  failures.push(...validateWebManifest(manifest))
  for (const iconPath of iconPathsFromManifest(manifest)) {
    if (!(await fileExists(joinRoot(distDir, iconPath)))) {
      failures.push({
        code: "missing-icon",
        message: `Manifest icon is missing from dist: ${iconPath}`,
      })
    }
  }

  const swSource = await readFile(joinRoot(distDir, "sw.js"), "utf8")
  failures.push(...validateServiceWorker(swSource))

  const indexHtml = await readFile(joinRoot(distDir, "index.html"), "utf8")
  const jsSources = [indexHtml]
  for (const match of indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    const src = match[1]
    if (!src) continue
    const filePath = joinRoot(distDir, src.replace(/^\//, ""))
    if (await fileExists(filePath)) jsSources.push(await readFile(filePath, "utf8"))
  }
  failures.push(...validateServiceWorkerRegistration(jsSources))

  const server = await startStaticServer()
  try {
    for (const route of smokeRoutes) {
      const response = await fetch(`http://127.0.0.1:${server.port}${route}`)
      const body = await response.text()
      if (!response.ok || !body.includes('id="root"')) {
        failures.push({
          code: "missing-file",
          message: `SPA fallback failed for ${route} (status ${response.status}).`,
        })
        continue
      }
      console.log(`SPA shell OK  ${route}`)
    }

    const manifestResponse = await fetch(`http://127.0.0.1:${server.port}/manifest.webmanifest`)
    if (!manifestResponse.ok) {
      failures.push({
        code: "invalid-manifest",
        message: "Could not fetch /manifest.webmanifest from the production shell.",
      })
    } else {
      console.log("Manifest OK   /manifest.webmanifest")
    }

    const swResponse = await fetch(`http://127.0.0.1:${server.port}/sw.js`)
    const swBody = await swResponse.text()
    if (!swResponse.ok || swBody.includes("__WB_MANIFEST")) {
      failures.push({
        code: "service-worker",
        message: "Could not fetch a valid /sw.js from the production shell.",
      })
    } else {
      console.log("Worker OK     /sw.js")
    }
  } finally {
    await server.close()
  }
}

if (failures.length > 0) {
  reportFailures(failures)
  throw new Error("Folo Lite production PWA validation failed.")
}

console.log("Folo Lite production PWA artifacts and SPA shell checks passed.")
