# Folo Lite (`apps/pwa`)

Mobile-first, PWA-first, reading-first client. This is not a port of the full desktop/web product.

Parent roadmap: GitHub #30.

## Architecture

Keep application complexity inside this app. Do not import desktop stores, navigation, modals, or layout systems.

```text
src/
  app/              router, shell, session, providers
  domain/           query keys, entry types, cache helpers, sanitization, media helpers
  infrastructure/   API client, auth client, query client, PWA update prompt
  features/
    timeline/       list queries, cards, infinite loading, read/save mutations, scroll restoration
    reader/         entry detail rendering and the minimal action header
    auth/           login
    subscriptions/  list + add-by-URL
    settings/       session + sign out
```

Query keys live in `src/domain/query-keys.ts`. Read/unread and save/unsave mutations must patch those keys (timeline pages, saved pages, and `entry-session`) instead of inventing new arrays.

The timeline route is a pathless layout so list → reader → back does not remount the list. Scroll snapshots are in-memory (`view.slug` + unread filter) and store an item anchor plus offset, not the list payload.

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
- Prefer CSS transitions for simple UI. Do not add a generic state library unless React Query and local state cannot solve the need.
- Independent CI lives in `.github/workflows/folo-lite.yml` and does not use `Folo#build:web` as a proxy.

Performance budgets, baselines, and the long-session profiling scenario are documented in `PERFORMANCE.md`.
