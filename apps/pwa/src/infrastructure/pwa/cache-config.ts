/**
 * Bounded runtime image cache policy for the Folo Lite service worker.
 *
 * Classification must stay self-contained: vite-plugin-pwa generateSW serializes
 * urlPattern functions via Function.prototype.toString(), so matchers cannot
 * close over module-level helpers. `resolveLiteRuntimeImageCacheRoute` is the
 * single source of truth; Workbox matchers are compiled from its source.
 *
 * Never mention API hostnames here. API/auth exclusion is pathname-only so the
 * generated sw.js stays network-only for user data.
 */

export const PWA_RUNTIME_CACHE_NAMES = {
  sameOriginStaticImages: "folo-lite-same-origin-static-images-v1",
  feedIcons: "folo-lite-feed-icons-v1",
  articleImages: "folo-lite-article-images-v1",
} as const

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

export type RuntimeImageCacheRoute =
  (typeof PWA_RUNTIME_CACHE_NAMES)[keyof typeof PWA_RUNTIME_CACHE_NAMES] extends string
    ? "feedIcons" | "sameOriginStaticImages" | "articleImages"
    : never

export type WorkboxImageMatchContext = {
  request: Pick<Request, "destination">
  url: URL
  sameOrigin: boolean
}

/**
 * Keep every constant and branch inside this function. generateSW inlines it
 * into sw.js, so outer-scope identifiers would be undefined at runtime.
 */
export function resolveLiteRuntimeImageCacheRoute(
  url: URL,
  sameOrigin: boolean,
): RuntimeImageCacheRoute | null {
  const sensitiveQueryParams = new Set([
    "signature",
    "sig",
    "token",
    "access_token",
    "x-amz-signature",
    "expires",
    "x-goog-signature",
    "policy",
  ])
  const imageExtensionPattern = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)(?:$|[?#])/i
  const feedIconSegmentPattern = /\/(?:avatars?|icons?|favicons?|feed-icons?|logos?)(?:\/|$)/i
  const feedIconFilenameStemPattern =
    /^(?:avatar|avatars|favicon|favicons|feed-icon|feed-icons|logo|logos|icon-\d+)$/i
  const userSpecificPathPattern = /\/(?:api|private|user|account|auth|better-auth)(?:\/|$)/i
  const sameOriginStaticPathPatterns = [
    /^\/assets\/[^/]+(?:-[a-f0-9]{8,}|\.[a-f0-9]{8,})\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i,
    /^\/icon-\d+x\d+\.png$/i,
    /^\/maskable-icon-\d+x\d+\.png$/i,
    /^\/icon\.svg$/i,
    /^\/favicon(?:-\d+x\d+)?\.(?:png|ico)$/i,
    /^\/apple-touch-icon(?:-\d+x\d+)?\.png$/i,
    /^\/pwa-\d+x\d+\.png$/i,
  ]

  const hasSensitiveQueryParams = (value: URL) => {
    for (const [paramName] of value.searchParams.entries()) {
      if (sensitiveQueryParams.has(paramName.toLowerCase())) return true
    }
    return false
  }

  const isHttpUrl = (value: URL) => value.protocol === "http:" || value.protocol === "https:"

  const isDeniedPath = (value: URL) =>
    value.pathname.startsWith("/api/") ||
    value.pathname.startsWith("/better-auth/") ||
    userSpecificPathPattern.test(value.pathname)

  const isImageProxyHost = (hostname: string) =>
    hostname === "img.folo.is" || hostname === "img.follow.is"

  const isSafeDirectImage = (value: URL) =>
    isHttpUrl(value) &&
    !isDeniedPath(value) &&
    !hasSensitiveQueryParams(value) &&
    imageExtensionPattern.test(value.pathname)

  const unwrap = (): URL | null => {
    if (!isHttpUrl(url)) return null
    if (!isImageProxyHost(url.hostname)) {
      return isSafeDirectImage(url) ? url : null
    }

    for (const [paramName] of url.searchParams.entries()) {
      if (paramName === "url" || paramName === "width" || paramName === "height") continue
      if (sensitiveQueryParams.has(paramName.toLowerCase())) return null
    }

    const target = url.searchParams.get("url")
    if (!target) return null
    try {
      const inner = new URL(target)
      if (!isHttpUrl(inner) || isDeniedPath(inner) || hasSensitiveQueryParams(inner)) return null
      if (isImageProxyHost(inner.hostname)) return null
      return inner
    } catch {
      return null
    }
  }

  const visible = unwrap()
  if (!visible) return null

  const filename = visible.pathname.split("/").pop() ?? ""
  const stem = filename.replace(/\.[^.]+$/, "")
  if (feedIconSegmentPattern.test(visible.pathname) || feedIconFilenameStemPattern.test(stem)) {
    return "feedIcons"
  }

  if (sameOrigin && !isImageProxyHost(url.hostname)) {
    if (sameOriginStaticPathPatterns.some((pattern) => pattern.test(url.pathname))) {
      return "sameOriginStaticImages"
    }
  }

  return "articleImages"
}

export const hasSensitiveQueryParams = (url: URL) => {
  for (const [paramName] of url.searchParams.entries()) {
    switch (paramName.toLowerCase()) {
      case "signature":
      case "sig":
      case "token":
      case "access_token":
      case "x-amz-signature":
      case "expires":
      case "x-goog-signature":
      case "policy": {
        return true
      }
      default: {
        break
      }
    }
  }
  return false
}

export const isSafeRuntimeImageUrl = (url: URL, sameOrigin = false) =>
  resolveLiteRuntimeImageCacheRoute(url, sameOrigin) !== null

export const isFeedIconOrAvatar = (url: URL, sameOrigin = false) =>
  resolveLiteRuntimeImageCacheRoute(url, sameOrigin) === "feedIcons"

export const isSameOriginStaticImage = (url: URL, origin: string) => {
  const sameOrigin = url.origin === origin
  return resolveLiteRuntimeImageCacheRoute(url, sameOrigin) === "sameOriginStaticImages"
}

export const shouldCacheAsArticleImage = (url: URL, origin: string) => {
  const sameOrigin = url.origin === origin
  return resolveLiteRuntimeImageCacheRoute(url, sameOrigin) === "articleImages"
}

const compileWorkboxImageMatcher = (kind: RuntimeImageCacheRoute) => {
  const resolveSource = resolveLiteRuntimeImageCacheRoute.toString()
  // generateSW inlines this function body into sw.js. The worker runs the
  // expanded source; Node only builds the matcher at config-load time.
  // eslint-disable-next-line no-new-func -- Workbox serializes urlPattern via Function#toString.
  return new Function(
    "{ request, url, sameOrigin }",
    `${resolveSource}
if (request.destination !== "image") return false;
return resolveLiteRuntimeImageCacheRoute(url, sameOrigin) === ${JSON.stringify(kind)};`,
  ) as (context: WorkboxImageMatchContext) => boolean
}

export const matchFeedIconImageRequest = compileWorkboxImageMatcher("feedIcons")
export const matchSameOriginStaticImageRequest =
  compileWorkboxImageMatcher("sameOriginStaticImages")
export const matchArticleImageRequest = compileWorkboxImageMatcher("articleImages")
