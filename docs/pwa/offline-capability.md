# PWA offline capability (first stage)

This document describes the current offline behavior shipped with the web/PWA build. It is the acceptance reference for [Issue #8](https://github.com/lhq1412/Folo/issues/8) phase 1.

## Product promise

After at least one successful online visit:

1. **App Shell** can start offline (navigation to the SPA shell succeeds).
2. **Recently viewed, non-sensitive images** may remain visible from bounded runtime caches.
3. **Offline banner** is shown when `navigator.onLine` is false.

## Explicit non-goals (phase 1)

- Full feed/article offline database
- Offline writes with background sync
- Guaranteed offline access to API-backed timelines or settings

## Runtime cache matrix

| Cache name                          | Strategy             | Matcher                                                | maxEntries |  maxAge | Quota behavior      |
| ----------------------------------- | -------------------- | ------------------------------------------------------ | ---------: | ------: | ------------------- |
| `folo-same-origin-static-images-v1` | CacheFirst           | Same-origin hashed static assets & PWA icons           |         80 | 30 days | `purgeOnQuotaError` |
| `folo-feed-icons-v1`                | StaleWhileRevalidate | Feed icons / avatars / favicons (cross-origin allowed) |        120 |  7 days | `purgeOnQuotaError` |
| `folo-article-images-v1`            | CacheFirst           | Other safe article images                              |        100 | 10 days | `purgeOnQuotaError` |

Source of truth: `apps/desktop/layer/renderer/src/lib/pwa/cache-config.ts` and `apps/desktop/layer/renderer/src/workers/sw/index.ts`.

## Exclusions (never cached in the service worker)

- `/api/**` responses
- User-specific paths (`/user`, `/account`, `/auth`, `/private`, …)
- URLs containing sensitive query params: `token`, `signature`, `expires`, `sig`, `access_token`, `x-amz-signature`, `x-goog-signature`, `policy`
- Non-image requests (except precached App Shell assets)

## Precache

App Shell assets are injected into the Workbox precache manifest at build time (`vite-plugin-pwa` + `injectManifest`). Build output includes a precache manifest snapshot used for validation in CI.

## Logout / account switch cleanup

Renderer code clears all runtime caches listed in `ALL_PWA_RUNTIME_CACHE_NAMES_TO_CLEAR` on logout/account switch. Legacy cache `image-assets` is removed on service worker activation.

## Legacy cache migration

`image-assets` is a legacy runtime cache name. New caches use the `folo-*-v1` namespace. SW `activate` deletes legacy caches.

## React Query persistence

React Query persistence is **not** a full offline article store.

- Only queries with `meta.persist` are dehydrated.
- Successful single-page responses are kept.
- Persisted cache expires after seven days (`QUERY_PERSIST_KEY` in localStorage).
- See `apps/desktop/layer/renderer/src/lib/query-client.ts`.

## PWA update coordination

Cross-tab update state lives in IndexedDB (`folo-pwa-update-state-v1`). `localStorage` keys and `BroadcastChannel` are notification signals only. See `apps/desktop/layer/renderer/src/lib/pwa/update-state-store.ts`.

## Follow-up (tracked separately)

- Production offline App Shell Playwright test (Issue #3 / Issue #8)
- Precache budget gate & machine-readable build report
- Full offline feed sync
