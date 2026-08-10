import { createReadStream, existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"

import { extname, join, normalize, resolve } from "pathe"

const scriptDir = fileURLToPath(new URL(".", import.meta.url))
const outDir = resolve(scriptDir, "..", "..", "out", "web")
const host = process.env.FOLO_E2E_WEB_PROD_SERVER_HOST ?? "127.0.0.1"
const port = Number(process.env.FOLO_E2E_WEB_PROD_SERVER_PORT ?? 4173)

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".eot": "application/vnd.ms-fontobject",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

const resolveCacheHeaders = (pathname: string): Record<string, string> => {
  if (pathname === "/sw.js" || pathname.startsWith("/workbox-")) {
    return {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    }
  }

  if (pathname === "/manifest.webmanifest") {
    return {
      "Cache-Control": "no-cache",
    }
  }

  if (pathname.startsWith("/assets/") || pathname.startsWith("/vendor/")) {
    return {
      "Cache-Control": "public, max-age=31536000, immutable",
    }
  }

  return {}
}

const shouldServeIndexHtml = (pathname: string, acceptHeader: string | undefined) => {
  if (!acceptHeader?.includes("text/html")) {
    return false
  }

  if (pathname.startsWith("/api/")) {
    return false
  }

  if (/\.[^/]+$/.test(pathname)) {
    return false
  }

  return true
}

const resolveFilePath = (pathname: string) => {
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "")
  const relativePath = normalizedPath === "/" ? "/index.html" : normalizedPath
  const absolutePath = resolve(outDir, `.${relativePath}`)

  if (!absolutePath.startsWith(outDir)) {
    return null
  }

  return absolutePath
}

const sendFile = async (
  response: ServerResponse,
  filePath: string,
  pathname: string,
  statusCode = 200,
) => {
  const extension = extname(filePath)
  const contentType = MIME_TYPES[extension] ?? "application/octet-stream"
  const cacheHeaders = resolveCacheHeaders(pathname)

  response.writeHead(statusCode, {
    "Content-Type": contentType,
    ...cacheHeaders,
  })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath)
    stream.on("error", rejectPromise)
    stream.on("end", () => resolvePromise())
    stream.pipe(response)
  })
}

const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`)
    const pathname = decodeURIComponent(requestUrl.pathname)
    const filePath = resolveFilePath(pathname)

    if (filePath && existsSync(filePath)) {
      await sendFile(response, filePath, pathname)
      return
    }

    if (shouldServeIndexHtml(pathname, request.headers.accept)) {
      const indexPath = join(outDir, "index.html")
      if (!existsSync(indexPath)) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
        response.end("index.html is missing from the production web build output.")
        return
      }

      await sendFile(response, indexPath, pathname)
      return
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    response.end("Not Found")
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
    response.end(error instanceof Error ? error.message : "Internal Server Error")
  }
}

const start = async () => {
  const indexPath = join(outDir, "index.html")
  const swPath = join(outDir, "sw.js")

  if (!existsSync(indexPath) || !existsSync(swPath)) {
    console.error(
      `[e2e] Production web output is missing at ${outDir}. Run "pnpm --dir apps/desktop run build:web" first.`,
    )
    process.exit(1)
  }

  await readFile(swPath, "utf8")

  const server = createServer((request, response) => {
    void handleRequest(request, response)
  })

  await new Promise<void>((resolvePromise) => {
    server.listen(port, host, () => {
      console.log(`[e2e] Serving production web build from ${outDir} at http://${host}:${port}`)
      resolvePromise()
    })
  })
}

void start()
