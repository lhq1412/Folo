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
import { CacheFirst } from "workbox-strategies"

import { registerPusher } from "./pusher"

declare let self: ServiceWorkerGlobalScope & {
  __FOLO_PRECACHE_MANIFEST__: Array<{ revision?: string | null; url: string }>
}

precacheAndRoute(self.__FOLO_PRECACHE_MANIFEST__)
;(
  self as ServiceWorkerGlobalScope & { __FOLLO_PRECACHE_BOUNDARY__?: string }
).__FOLLO_PRECACHE_BOUNDARY__ = "folo-precache-manifest-boundary"
cleanupOutdatedCaches()
clientsClaim()

const navigationHandler = createHandlerBoundToURL("/index.html")
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /\/[^/?][^./?]*\.[^/]+$/],
  }),
)

registerPusher(self)

registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "image-assets",
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 10 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)
