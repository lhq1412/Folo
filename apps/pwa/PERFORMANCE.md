# Folo Lite performance

This app (`apps/pwa`) has its own budget. Full-web PWA measurements from `apps/desktop` are reference material only.

## Commands

```bash
pnpm --dir apps/pwa build
pnpm --dir apps/pwa analyze:bundle
pnpm --dir apps/pwa check:budget
```

`analyze:bundle` prints a human summary and writes `performance/bundle-report.json` (gitignored). `check:budget` compares that production build against the committed baseline and the hard gzip caps.

To refresh the committed baseline after an intentional size change:

```bash
pnpm --dir apps/pwa build
pnpm --dir apps/pwa analyze:bundle -- --write-baseline
```

Explain the increase in the PR. Do not raise the hard caps or rewrite the baseline just to make CI green.

## Hard caps

| Metric           | Budget     |
| ---------------- | ---------- |
| Initial JS gzip  | <= 250 KiB |
| Initial CSS gzip | <= 50 KiB  |

Initial assets are the `script[src]`, `link[rel=modulepreload]`, and `link[rel=stylesheet]` tags in `dist/index.html` after a production Vite build. Gzip size is `zlib.gzipSync` at Node's default level, measured from the real `dist` files.

CI also fails if gzip grows more than `max(8 KiB, 5% of baseline)` above `performance/baseline.json`.

## Recorded M0 baseline (2026-08-20)

Production `vite build` on Node 22. Gzip via `zlib.gzipSync`.

| Graph             | gzip      | Notes                                                                          |
| ----------------- | --------- | ------------------------------------------------------------------------------ |
| Initial JS        | 107.2 KiB | App shell only (`index-*.js`). Under 250 KiB cap.                              |
| Initial CSS       | 11.3 KiB  | Under 50 KiB cap.                                                              |
| login             | 1.0 KiB   | Auth form.                                                                     |
| timeline + reader | 86.3 KiB  | Shared lazy chunk plus FollowClient SDK. Reader is not a separate route chunk. |
| subscriptions     | 72.7 KiB  | Mostly the shared API client.                                                  |
| discover          | 70.5 KiB  | Mostly the shared API client.                                                  |
| settings          | 1.7 KiB   | Sign out.                                                                      |

## Recorded M1 (2026-08-20)

Same measurement method. Reader is now its own lazy route (`ReaderPage`) so list → reader does not remount the timeline. Vite is 8.1.4 (same as the other Vite-native apps) so workspace `ensure-package-version` lint passes; the desktop toolchain stays on Vite 7.

| Graph         | gzip      | Notes                                                                             |
| ------------- | --------- | --------------------------------------------------------------------------------- |
| Initial JS    | 107.7 KiB | App shell plus a Vite 8 `env` preload. Under the 8 KiB / 5% regression allowance. |
| Initial CSS   | 12.2 KiB  | Reader/timeline action classes. Still under the CSS cap and regression allowance. |
| login         | 1.0 KiB   | Unchanged.                                                                        |
| timeline      | 87.2 KiB  | List layout chunk plus shared API client.                                         |
| reader        | 86.7 KiB  | Reader chunk plus shared API client / sanitizer.                                  |
| subscriptions | 72.9 KiB  | Unchanged shape.                                                                  |
| discover      | 70.5 KiB  | Unchanged.                                                                        |
| settings      | 1.7 KiB   | Unchanged.                                                                        |

## Recorded M2–M4 (2026-08-20)

Production `vite build` on Node 22 after this change. Gzip via `zlib.gzipSync`. This environment cannot capture real-device JS heap or decoded-image memory; those numbers still belong on a phone (see the long-session scenario). The code policy below is the automated gate until that lab data exists.

| Graph         | gzip      | Notes                                                                                  |
| ------------- | --------- | -------------------------------------------------------------------------------------- |
| Initial JS    | 109.8 KiB | App shell plus persistence/session hydrate. Under the 8 KiB / 5% regression allowance. |
| Initial CSS   | 12.4 KiB  | `content-visibility` list rows. Still under the CSS cap.                               |
| login         | 9.2 KiB   | Shared `env` chunk now attributed to login (sign-in still clears persisted data).      |
| timeline      | 94.0 KiB  | List layout plus shared API client.                                                    |
| reader        | 93.6 KiB  | Reader chunk plus shared API client / sanitizer.                                       |
| subscriptions | 79.7 KiB  | Unchanged shape.                                                                       |
| discover      | 77.4 KiB  | Unchanged shape.                                                                       |
| settings      | 9.9 KiB   | Sign out now wipes IndexedDB + session snapshot.                                       |

### Bounded retained work (#37)

- Image proxy sizes are centralized in `src/domain/media.ts`: feed icon 64, avatar 96, social grid 400/800, pictures 600, reader body 960.
- List rows use `content-visibility: auto`. Picture cards set `contain-intrinsic-size` so masonry columns do not collapse before paint.
- Infinite queries keep `maxPages: 6` (120 items at `PAGE_SIZE` 20). Fetch-next evicts the oldest page. Scroll restoration still prefers the item anchor; if that id was evicted it uses `scrollTop`, then the top of the remaining list.
- Virtualization is skipped: 120 DOM rows with `content-visibility` is enough for the current cards, Pictures masonry does not window cleanly, and a second hidden list would violate the “no duplicate list” rule. Revisit only if a device profile shows heap/DOM growth inside this 6-page window.

### Runtime image caches (#38)

`generateSW` stays in place. Workbox `runtimeCaching` adds three Lite-prefixed caches (80 / 120 / 100 entries, age-limited, `purgeOnQuotaError`). Matchers classify `https://img.folo.is?url=` by the proxied target and reject API, auth, signed, and unparseable URLs. `check:dist` allows those named `CacheFirst` / `StaleWhileRevalidate` caches and still fails on `NetworkFirst` or `api.folo.is` / `api.follow.is` in `sw.js`.

### Selective offline persistence (#39)

IndexedDB (`folo-lite-query-cache`, schema 1) stores dehydrated React Query state for timeline/saved pages, recently opened entry details, and entry-session metadata. Caps: 8 list queries, 24 details, 40 sessions, 7-day age. A localStorage session snapshot is `{ userId, name, email }` only. Logout, account change, and schema bumps wipe the store. Quota failures disable persistence and keep the session online-only. API responses are not stored in the service worker.

Web Vitals, DOM-after-N-pages, and JS heap are not in this file. Capture those with the long-session scenario below on a real device.

## Measurement assumptions

- Production `vite build` in `apps/pwa` (not `Folo#build:web`).
- Node 22, pnpm workspace install, default gzip.
- Lab Web Vitals: Chrome mobile emulation, mid-tier phone CPU (4x slowdown), Slow 4G. Record LCP / INP / CLS from a real device when possible; do not optimize solely for a Lighthouse score.
- Timeline images should request proxy variants sized to the card (`64` feed icon, `96` avatar, `400`/`800` social grid, `600` pictures, `960` reader).

## Expected request shape (code)

These are architecture invariants, not Lighthouse guesses:

1. Document / app shell (HTML, initial JS, initial CSS, web manifest).
2. Service worker registration after first load (`vite-plugin-pwa` prompt mode).
3. Session request via better-auth (`cache: "no-store"`).
4. One timeline `entries.list` request for the active view. No default refetch-on-focus and no SW API cache.
5. Opening a reader adds `entries.get` for that id.
6. Opening an unread entry adds one `reads.markAsRead` POST. Save/unsave uses `collections.post` / `collections.delete`. These patch React Query caches in place; they must not refetch the timeline.
7. Returning from the reader must not refetch loaded timeline pages. Timeline queries use `refetchOnMount: false` and a 5-minute `staleTime`. Scroll position is restored from an in-memory anchor, never from localStorage.

## Long-session scenario

Repeat on a real phone or Chrome remote debugging. Do not treat a single Lighthouse run as coverage.

1. Cold launch the installed PWA (or a production preview).
2. Open Home (Articles).
3. Continuously scroll several timeline pages.
4. Open about 10 entries and return to the same timeline after each.
5. Switch to Social and Pictures and continue scrolling.
6. Background the PWA, resume, and continue.
7. Observe:
   - DOM node count after 1 / 5 / 10 / 20 loaded pages
   - JS heap trend
   - image request dimensions/bytes for Articles, Social, Pictures
   - layout/style work and >50ms long tasks
   - duplicate network requests
   - recovery after background/resume

The retained-page cap (`MAX_RETAINED_PAGES`) and image sizes are the automated stand-in for a DOM/heap gate. When you have a device profile, record 1 / 5 / 6 loaded pages (the eviction boundary) next to the PR rather than every historically loaded page.

Record notes next to a PR when a change can affect long-session memory, images, or scrolling.

## Updating a budget

1. Capture the new `analyze:bundle` output.
2. If still under the hard caps, update `performance/baseline.json` with `--write-baseline`.
3. In the PR, say what landed in the initial JS/CSS graph and why the size is justified.
4. Only change the 250 / 50 KiB caps in `scripts/bundle-report.ts` when the product budget itself changes.
