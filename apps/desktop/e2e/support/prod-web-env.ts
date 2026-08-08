import { join, normalize } from "pathe"

export const PROD_WEB_SERVER_HOST = process.env.FOLO_E2E_WEB_PROD_SERVER_HOST ?? "127.0.0.1"
export const PROD_WEB_SERVER_PORT = Number(process.env.FOLO_E2E_WEB_PROD_SERVER_PORT ?? 4173)

export const resolveProdWebServerURL = () => {
  return (
    process.env.FOLO_E2E_WEB_PROD_SERVER_URL ??
    `http://${PROD_WEB_SERVER_HOST}:${PROD_WEB_SERVER_PORT}`
  )
}

const normalizeRoute = (route: string) => {
  if (!route || route === "/") {
    return "/"
  }

  return route.startsWith("/") ? route : `/${route}`
}

export const buildProdWebAppURL = (route = "/") => {
  const normalizedRoute = normalizeRoute(route)
  return new URL(normalizedRoute, `${resolveProdWebServerURL()}/`).toString()
}

export const resolveProdWebOutputDir = (desktopAppDir: string) => {
  return join(desktopAppDir, "out", "web")
}

export const resolveProdWebServiceWorkerPath = (desktopAppDir: string) => {
  return join(resolveProdWebOutputDir(desktopAppDir), "sw.js")
}

export const normalizePublicPath = (pathname: string) => {
  const normalized = normalize(pathname)
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}
