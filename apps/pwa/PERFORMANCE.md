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

Web Vitals, DOM-after-N-pages, and JS heap are not in this file. Capture those with the long-session scenario below; #37 should turn the memory/DOM part into a gate.

## Measurement assumptions

- Production `vite build` in `apps/pwa` (not `Folo#build:web`).
- Node 22, pnpm workspace install, default gzip.
- Lab Web Vitals: Chrome mobile emulation, mid-tier phone CPU (4x slowdown), Slow 4G. Record LCP / INP / CLS from a real device when possible; do not optimize solely for a Lighthouse score.
- Timeline images should request proxy variants sized to the card (`400`/`800` wide for social grids, `600` wide for pictures).

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

Record notes next to a PR when a change can affect long-session memory, images, or scrolling. Automated DOM/heap gates belong to #37 once this baseline exists.

## Updating a budget

1. Capture the new `analyze:bundle` output.
2. If still under the hard caps, update `performance/baseline.json` with `--write-baseline`.
3. In the PR, say what landed in the initial JS/CSS graph and why the size is justified.
4. Only change the 250 / 50 KiB caps in `scripts/bundle-report.ts` when the product budget itself changes.
