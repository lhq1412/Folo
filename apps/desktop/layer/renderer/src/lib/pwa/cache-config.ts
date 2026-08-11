import { IMAGE_PROXY_URL } from "@follow/utils/img-proxy"

/**
 * Shared runtime cache configuration for the PWA service worker and renderer cleanup.
 *
 * First-stage offline policy:
 * - App Shell is precached and can start offline after one successful online visit.
 * - Recently loaded, non-sensitive images may remain viewable from bounded runtime caches.
 * - API responses and user-specific data are never cached in the service worker.
 */

export const PWA_RUNTIME_CACHE_NAMES = {
  sameOriginStaticImages: "folo-same-origin-static-images-v1",
  feedIcons: "folo-feed-icons-v1",
  articleImages: "folo-article-images-v1",
} as const

export const LEGACY_PWA_RUNTIME_CACHE_NAMES = ["image-assets"] as const

export type PwaRuntimeCacheName =
  (typeof PWA_RUNTIME_CACHE_NAMES)[keyof typeof PWA_RUNTIME_CACHE_NAMES]

export const PWA_RUNTIME_CACHE_LIMITS = {
  sameOriginStaticImages: {
    maxEntries: 80,
    maxAgeSeconds: 30 * 24 * 60 * 60,
  },
  feedIcons: {
    maxEntries: 120,
    maxAgeSeconds: 7 * 24 * 60 * 60,
  },
  articleImages: {
    maxEntries: 100,
    maxAgeSeconds: 10 * 24 * 60 * 60,
  },
} as const

export const PWA_RUNTIME_CACHE_NAME_LIST = Object.values(PWA_RUNTIME_CACHE_NAMES)

export const ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR = [
  ...PWA_RUNTIME_CACHE_NAME_LIST,
  ...LEGACY_PWA_RUNTIME_CACHE_NAMES,
] as const

const SENSITIVE_QUERY_PARAMS = new Set([
  "signature",
  "sig",
  "token",
  "access_token",
  "x-amz-signature",
  "expires",
  "x-goog-signature",
  "policy",
])

const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)(?:$|[?#])/i

const FEED_ICON_SEGMENT_PATTERN = /\/(?:avatars?|icons?|favicons?|feed-icons?|logos?)(?:\/|$)/i

const FEED_ICON_FILENAME_STEM_PATTERN =
  /^(?:avatar|avatars|favicon|favicons|feed-icon|feed-icons|logo|logos|icon-\d+)$/i

const USER_SPECIFIC_PATH_PATTERN = /\/(?:api|private|user|account|auth)(?:\/|$)/i

const SAME_ORIGIN_STATIC_PATH_PATTERNS = [
  /^\/assets\/[^/]+(?:-[a-f0-9]{8,}|\.[a-f0-9]{8,})\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i,
  /^\/pwa-\d+x\d+\.png$/i,
  /^\/apple-touch-icon(?:-\d+x\d+)?\.png$/i,
  /^\/maskable-icon-\d+x\d+\.png$/i,
  /^\/favicon(?:-\d+x\d+)?\.(?:png|ico)$/i,
] as const

export type RuntimeImageCacheRoute = "feedIcons" | "sameOriginStaticImages" | "articleImages" | null

export function hasSensitiveQueryParams(url: URL): boolean {
  for (const [paramName] of url.searchParams.entries()) {
    if (SENSITIVE_QUERY_PARAMS.has(paramName.toLowerCase())) {
      return true
    }
  }

  return false
}

function getDecodedPathname(url: URL): string | null {
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    return null
  }
}

export function isApiUrl(url: URL): boolean {
  return getDecodedPathname(url)?.startsWith("/api/") ?? false
}

export function isUserSpecificPath(url: URL): boolean {
  const pathname = getDecodedPathname(url)
  return pathname !== null && USER_SPECIFIC_PATH_PATTERN.test(pathname)
}

function hasSafeRuntimeUrlBoundary(url: URL): boolean {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username &&
    !url.password &&
    getDecodedPathname(url) !== null &&
    !isApiUrl(url) &&
    !isUserSpecificPath(url) &&
    !hasSensitiveQueryParams(url)
  )
}

function getSafeImageProxyTarget(url: URL): URL | null {
  if (
    url.origin !== IMAGE_PROXY_URL ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    hasSensitiveQueryParams(url)
  ) {
    return null
  }

  const targets = url.searchParams.getAll("url")
  if (targets.length !== 1) {
    return null
  }

  try {
    const target = new URL(targets[0]!)
    return target.origin !== IMAGE_PROXY_URL && hasSafeRuntimeUrlBoundary(target) ? target : null
  } catch {
    return null
  }
}

function getSafeRuntimeImageClassificationUrl(url: URL): URL | null {
  if (url.origin === IMAGE_PROXY_URL) {
    return getSafeImageProxyTarget(url)
  }

  return hasSafeRuntimeUrlBoundary(url) && IMAGE_EXTENSION_PATTERN.test(url.pathname) ? url : null
}

export function isSafeRuntimeImageUrl(url: URL): boolean {
  return getSafeRuntimeImageClassificationUrl(url) !== null
}

export function isSameOriginStaticImage(url: URL, origin: string): boolean {
  if (url.origin === IMAGE_PROXY_URL || url.origin !== origin || !isSafeRuntimeImageUrl(url)) {
    return false
  }

  return SAME_ORIGIN_STATIC_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname))
}

export function isFeedIconOrAvatar(url: URL): boolean {
  const classificationUrl = getSafeRuntimeImageClassificationUrl(url)
  if (!classificationUrl) {
    return false
  }

  if (FEED_ICON_SEGMENT_PATTERN.test(classificationUrl.pathname)) {
    return true
  }

  const filename = classificationUrl.pathname.split("/").pop() ?? ""
  const stem = filename.replace(/\.[^.]+$/, "")
  return FEED_ICON_FILENAME_STEM_PATTERN.test(stem)
}

export function shouldCacheAsArticleImage(url: URL, appOrigin: string): boolean {
  if (!isSafeRuntimeImageUrl(url)) {
    return false
  }

  if (isFeedIconOrAvatar(url) || isSameOriginStaticImage(url, appOrigin)) {
    return false
  }

  return true
}

export function resolveRuntimeImageCacheRoute(url: URL, origin: string): RuntimeImageCacheRoute {
  if (!isSafeRuntimeImageUrl(url)) {
    return null
  }

  if (isFeedIconOrAvatar(url)) {
    return "feedIcons"
  }

  if (isSameOriginStaticImage(url, origin)) {
    return "sameOriginStaticImages"
  }

  if (shouldCacheAsArticleImage(url, origin)) {
    return "articleImages"
  }

  return null
}

export async function deletePwaRuntimeCacheNames(cacheNames: readonly string[]): Promise<void> {
  if (!("caches" in globalThis)) {
    return
  }

  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
}

export async function clearLegacyPwaRuntimeCaches(): Promise<void> {
  await deletePwaRuntimeCacheNames(LEGACY_PWA_RUNTIME_CACHE_NAMES)
}

export async function clearPwaRuntimeCaches(): Promise<void> {
  await deletePwaRuntimeCacheNames(ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR)
}
