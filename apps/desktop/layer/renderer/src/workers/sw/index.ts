/// <reference lib="webworker" />
import { CacheableResponsePlugin } from "workbox-cacheable-response"
import { clientsClaim } from "workbox-core"
import { ExpirationPlugin } from "workbox-expiration"
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies"

import {
  clearLegacyPwaRuntimeCaches,
  isFeedIconOrAvatar,
  isSameOriginStaticImage,
  PWA_RUNTIME_CACHE_LIMITS,
  PWA_RUNTIME_CACHE_NAMES,
  shouldCacheAsArticleImage,
} from "../../lib/pwa/cache-config"
import {
  PWA_BUILD_REVISION_REQUEST,
  PWA_BUILD_REVISION_RESPONSE,
} from "../../lib/pwa/pwa-sw-messages"
import { registerPusher } from "./pusher"

declare const PWA_BUILD_REVISION: string

declare let self: ServiceWorkerGlobalScope & {
  __FOLO_PRECACHE_MANIFEST__: Array<{ revision?: string | null; url: string }>
}

precacheAndRoute(self.__FOLO_PRECACHE_MANIFEST__)
;(
  self as ServiceWorkerGlobalScope & { __FOLLO_PRECACHE_BOUNDARY__?: string }
).__FOLLO_PRECACHE_BOUNDARY__ = "folo-precache-manifest-boundary"
cleanupOutdatedCaches()
clientsClaim()

self.addEventListener("activate", (event) => {
  event.waitUntil(clearLegacyPwaRuntimeCaches())
})

self.addEventListener("message", (event) => {
  if (event.data?.type !== PWA_BUILD_REVISION_REQUEST) {
    return
  }

  const port = event.ports[0]
  if (!port) {
    return
  }

  port.postMessage({
    type: PWA_BUILD_REVISION_RESPONSE,
    revision: PWA_BUILD_REVISION,
  })
})

const navigationHandler = createHandlerBoundToURL("/index.html")
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /\/[^/?][^./?]*\.[^/]+$/],
  }),
)

registerPusher(self)

const sameOriginStaticImageCache = new CacheFirst({
  cacheName: PWA_RUNTIME_CACHE_NAMES.sameOriginStaticImages,
  plugins: [
    new CacheableResponsePlugin({
      statuses: [0, 200],
    }),
    new ExpirationPlugin({
      maxEntries: PWA_RUNTIME_CACHE_LIMITS.sameOriginStaticImages.maxEntries,
      maxAgeSeconds: PWA_RUNTIME_CACHE_LIMITS.sameOriginStaticImages.maxAgeSeconds,
      purgeOnQuotaError: true,
    }),
  ],
})

const feedIconCache = new StaleWhileRevalidate({
  cacheName: PWA_RUNTIME_CACHE_NAMES.feedIcons,
  plugins: [
    new CacheableResponsePlugin({
      statuses: [0, 200],
    }),
    new ExpirationPlugin({
      maxEntries: PWA_RUNTIME_CACHE_LIMITS.feedIcons.maxEntries,
      maxAgeSeconds: PWA_RUNTIME_CACHE_LIMITS.feedIcons.maxAgeSeconds,
      purgeOnQuotaError: true,
    }),
  ],
})

const articleImageCache = new CacheFirst({
  cacheName: PWA_RUNTIME_CACHE_NAMES.articleImages,
  plugins: [
    new CacheableResponsePlugin({
      statuses: [0, 200],
    }),
    new ExpirationPlugin({
      maxEntries: PWA_RUNTIME_CACHE_LIMITS.articleImages.maxEntries,
      maxAgeSeconds: PWA_RUNTIME_CACHE_LIMITS.articleImages.maxAgeSeconds,
      purgeOnQuotaError: true,
    }),
  ],
})

registerRoute(({ request, url }) => {
  if (request.destination !== "image") {
    return false
  }

  return isFeedIconOrAvatar(url)
}, feedIconCache)

registerRoute(({ request, url }) => {
  if (request.destination !== "image") {
    return false
  }

  return isSameOriginStaticImage(url, self.location.origin)
}, sameOriginStaticImageCache)

registerRoute(({ request, url }) => {
  if (request.destination !== "image") {
    return false
  }

  return shouldCacheAsArticleImage(url, self.location.origin)
}, articleImageCache)
