const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.folo.is",
  "https://folo.is",
  "https://dev.folo.is",
  "https://staging.folo.is",
  "http://localhost:2233",
  "http://127.0.0.1:2233",
  "http://localhost:2234",
  "http://127.0.0.1:2234",
]

export const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

export const DEFAULT_ALLOWED_HEADERS = [
  "accept",
  "accept-language",
  "authorization",
  "cache-control",
  "content-type",
  "folo-referral-code",
  "x-app-dev",
  "x-app-name",
  "x-app-platform",
  "x-app-version",
  "x-client-id",
  "x-session-id",
]

/**
 * @param {string | undefined | null} value
 * @param {readonly string[]} defaults
 */
export function parseAllowedOrigins(value, defaults = DEFAULT_ALLOWED_ORIGINS) {
  const configured = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  return [...new Set([...defaults, ...configured])]
}

/**
 * @param {string | null | undefined} origin
 * @returns {string | null} Normalized origin or null when invalid.
 */
export function normalizeOrigin(origin) {
  if (!origin) {
    return null
  }

  try {
    const url = new URL(origin)
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

/**
 * @param {string} origin
 * @param {readonly string[]} allowedOrigins
 */
export function isOriginAllowed(origin, allowedOrigins) {
  const normalized = normalizeOrigin(origin)
  if (!normalized) {
    return false
  }

  return allowedOrigins.includes(normalized)
}

/**
 * @param {string | null | undefined} requestHeaders
 * @param {readonly string[]} allowedHeaders
 */
export function areRequestedHeadersAllowed(requestHeaders, allowedHeaders) {
  if (!requestHeaders) {
    return true
  }

  const allowed = new Set(allowedHeaders.map((header) => header.toLowerCase()))
  const requested = requestHeaders
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)

  return requested.every((header) => allowed.has(header))
}

/**
 * @param {string | null | undefined} requestMethod
 * @param {readonly string[]} allowedMethods
 */
export function isRequestedMethodAllowed(requestMethod, allowedMethods) {
  if (!requestMethod) {
    return true
  }

  return allowedMethods.includes(requestMethod.toUpperCase())
}

/**
 * @param {{
 *   origin: string
 *   allowedMethods?: readonly string[]
 *   allowedHeaders?: readonly string[]
 *   maxAgeSeconds?: number
 * }} options
 */
export function buildCorsHeaders({
  origin,
  allowedMethods = DEFAULT_ALLOWED_METHODS,
  allowedHeaders = DEFAULT_ALLOWED_HEADERS,
  maxAgeSeconds = 86_400,
}) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": allowedHeaders.join(", "),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": String(maxAgeSeconds),
    Vary: "Origin",
  }
}

/**
 * @param {Request} request
 * @param {{
 *   allowedOrigins: readonly string[]
 *   allowedMethods?: readonly string[]
 *   allowedHeaders?: readonly string[]
 * }} config
 * @returns {{
 *   action: "proxy"
 *   corsHeaders: Record<string, string> | null
 * } | {
 *   action: "forbidden"
 *   status: 403
 *   corsHeaders: null
 * }} CORS decision for proxying or rejecting the request.
 */
export function resolveCorsDecision(request, config) {
  const originHeader = request.headers.get("Origin")
  const allowedMethods = config.allowedMethods ?? DEFAULT_ALLOWED_METHODS
  const allowedHeaders = config.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS

  if (!originHeader) {
    return {
      action: "proxy",
      corsHeaders: null,
    }
  }

  const normalizedOrigin = normalizeOrigin(originHeader)
  if (!normalizedOrigin || !config.allowedOrigins.includes(normalizedOrigin)) {
    return {
      action: "forbidden",
      status: 403,
      corsHeaders: null,
    }
  }

  if (request.method === "OPTIONS") {
    const requestMethod = request.headers.get("Access-Control-Request-Method")
    const requestHeaders = request.headers.get("Access-Control-Request-Headers")

    if (
      !isRequestedMethodAllowed(requestMethod, allowedMethods) ||
      !areRequestedHeadersAllowed(requestHeaders, allowedHeaders)
    ) {
      return {
        action: "forbidden",
        status: 403,
        corsHeaders: null,
      }
    }
  }

  return {
    action: "proxy",
    corsHeaders: buildCorsHeaders({
      origin: normalizedOrigin,
      allowedMethods,
      allowedHeaders,
    }),
  }
}

/**
 * @param {Record<string, string>} headers
 * @param {Record<string, string> | null} corsHeaders
 */
export function applyCorsHeaders(headers, corsHeaders) {
  if (!corsHeaders) {
    return headers
  }

  const nextHeaders = new Headers(headers)
  for (const [key, value] of Object.entries(corsHeaders)) {
    nextHeaders.set(key, value)
  }

  return nextHeaders
}
