import {
  matchArticleImageRequest,
  matchFeedIconImageRequest,
  matchSameOriginStaticImageRequest,
  PWA_RUNTIME_CACHE_LIMITS,
  PWA_RUNTIME_CACHE_NAMES,
} from "./cache-config"

export type LiteRuntimeCaching = {
  handler: "CacheFirst" | "StaleWhileRevalidate"
  method: "GET"
  options: {
    cacheName: string
    cacheableResponse: { statuses: number[] }
    expiration: {
      maxAgeSeconds: number
      maxEntries: number
      purgeOnQuotaError: boolean
    }
  }
  urlPattern: typeof matchFeedIconImageRequest
}

const imageCacheOptions = (
  cacheName: string,
  limits: { maxAgeSeconds: number; maxEntries: number },
) => ({
  cacheName,
  cacheableResponse: { statuses: [0, 200] },
  expiration: {
    maxAgeSeconds: limits.maxAgeSeconds,
    maxEntries: limits.maxEntries,
    purgeOnQuotaError: true,
  },
})

export const liteRuntimeCaching: LiteRuntimeCaching[] = [
  {
    handler: "StaleWhileRevalidate",
    method: "GET",
    options: imageCacheOptions(
      PWA_RUNTIME_CACHE_NAMES.feedIcons,
      PWA_RUNTIME_CACHE_LIMITS.feedIcons,
    ),
    urlPattern: matchFeedIconImageRequest,
  },
  {
    handler: "CacheFirst",
    method: "GET",
    options: imageCacheOptions(
      PWA_RUNTIME_CACHE_NAMES.sameOriginStaticImages,
      PWA_RUNTIME_CACHE_LIMITS.sameOriginStaticImages,
    ),
    urlPattern: matchSameOriginStaticImageRequest,
  },
  {
    handler: "CacheFirst",
    method: "GET",
    options: imageCacheOptions(
      PWA_RUNTIME_CACHE_NAMES.articleImages,
      PWA_RUNTIME_CACHE_LIMITS.articleImages,
    ),
    urlPattern: matchArticleImageRequest,
  },
]
