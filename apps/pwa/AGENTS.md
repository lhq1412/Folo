# Folo Lite (`apps/pwa`)

Mobile-first, PWA-first, reading-first client. This is not a port of the full desktop/web product.

Parent roadmap: GitHub #30.

## Architecture

Keep application complexity inside this app. Do not import desktop stores, navigation, modals, or layout systems.

```text
src/
  app/              router, shell, session, providers
  domain/           query keys, entry types, cache helpers, sanitization, media helpers
  infrastructure/   API client, auth client, query client, PWA caches, IndexedDB persistence
  features/
    timeline/       list queries, cards, infinite loading, read/save mutations, scroll restoration
    reader/         entry detail rendering and the minimal action header
    auth/           login
    subscriptions/  list + add-by-URL
    settings/       session + sign out
```

Query keys live in `src/domain/query-keys.ts`. Read/unread and save/unsave mutations must patch those keys (timeline pages, saved pages, and `entry-session`) instead of inventing new arrays.

The timeline route is a pathless layout so list → reader → back does not remount the list. Scroll snapshots are in-memory (`view.slug` + unread filter) and store an item anchor plus offset, not the list payload.

Timeline infinite queries keep at most `MAX_RETAINED_PAGES` (6 × 20 items). Virtualization is not used; `content-visibility` plus page eviction bounds DOM/memory. If an anchored item was evicted, restoration falls back to `scrollTop`, then the top of the remaining list.

The service worker precaches the app shell and may runtime-cache **safe images only** (`CacheFirst` / `StaleWhileRevalidate`, Lite-prefixed, bounded). API/auth/user data stay network-only. Recent timeline/entry/session query data persist in IndexedDB, not in the service worker. Logout and account change wipe that store. Session snapshots in localStorage are `{ userId, name, email }` only — never tokens.

## Commands

```bash
pnpm --dir apps/pwa dev
pnpm --dir apps/pwa typecheck
pnpm --dir apps/pwa test
pnpm --dir apps/pwa build
pnpm --dir apps/pwa check:dist
pnpm --dir apps/pwa analyze:bundle
pnpm --dir apps/pwa check:budget
```

`check:dist` and `check:budget` require a production `dist/` from `pnpm --dir apps/pwa build`.

## CI

`.github/workflows/folo-lite.yml` is independent of `Folo#build:web`. It runs typecheck, unit tests, production build, PWA artifact/SPA-shell validation, and the bundle budget check.

The workflow is path-filtered to `apps/pwa`, `packages/configs`, `packages/internal/components`, `packages/internal/utils`, lockfile/workspace config, and the workflow file. Unrelated desktop/mobile-only PRs skip it.

## Constraints

- No default background polling.
- No API / user-data caching in the service worker.
- Persist only timeline, saved, entry detail, and entry-session queries in IndexedDB. Bound by count and 7-day age.
- Prefer CSS transitions for simple UI. Do not add a generic state library unless React Query and local state cannot solve the need.
- Independent CI lives in `.github/workflows/folo-lite.yml` and does not use `Folo#build:web` as a proxy.

Performance budgets, baselines, and the long-session profiling scenario are documented in `PERFORMANCE.md`.
