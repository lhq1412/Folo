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

const SENSITIVE_QUERY_PARAMS = [
  "signature",
  "sig",
  "token",
  "access_token",
  "x-amz-signature",
  "expires",
  "x-goog-signature",
  "policy",
] as const

const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)(?:$|[?#])/i

const FEED_ICON_PATH_PATTERN = /\/(?:avatar|icon|favicon|feed-icon|logo)(?:\/|$)/i

export function hasSensitiveQueryParams(url: URL): boolean {
  for (const param of SENSITIVE_QUERY_PARAMS) {
    if (url.searchParams.has(param)) {
      return true
    }
  }

  return false
}

export function isApiUrl(url: URL): boolean {
  return url.pathname.startsWith("/api/")
}

export function isSameOriginStaticImage(url: URL, origin: string): boolean {
  return url.origin === origin && IMAGE_EXTENSION_PATTERN.test(url.pathname)
}

export function isFeedIconOrAvatar(url: URL): boolean {
  if (!IMAGE_EXTENSION_PATTERN.test(url.pathname)) {
    return false
  }

  return FEED_ICON_PATH_PATTERN.test(url.pathname)
}

export function shouldCacheAsArticleImage(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false
  }

  if (isApiUrl(url) || hasSensitiveQueryParams(url)) {
    return false
  }

  return IMAGE_EXTENSION_PATTERN.test(url.pathname)
}

export async function clearPwaRuntimeCaches(): Promise<void> {
  if (!("caches" in globalThis)) {
    return
  }

  await Promise.all(
    PWA_RUNTIME_CACHE_NAME_LIST.map(async (cacheName) => {
      await caches.delete(cacheName)
    }),
  )
}
