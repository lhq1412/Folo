// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query"
import { describe, expect, test } from "vitest"

import { persistableQueryKind, queryKeys } from "../domain/query-keys"
import {
  createQueryPersistence,
  memoryPersistenceStore,
  PERSIST_MAX_AGE_MS,
  PERSIST_MAX_ENTRY_DETAILS,
  PERSIST_MAX_ENTRY_SESSIONS,
  PERSIST_MAX_LIST_QUERIES,
  PERSIST_SCHEMA_VERSION,
  pruneDehydratedState,
  restoreQueriesIfNewer,
  shouldDehydrateLiteQuery,
} from "./persistence"
import { writeSessionSnapshot } from "./session-snapshot"

const dehydratedQuery = (
  queryKey: readonly unknown[],
  updatedAt: number,
  data: unknown = { ok: true },
) => ({
  queryHash: JSON.stringify(queryKey),
  queryKey: [...queryKey],
  state: {
    data,
    dataUpdateCount: 1,
    dataUpdatedAt: updatedAt,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    fetchStatus: "idle" as const,
    isInvalidated: false,
    status: "success" as const,
  },
})

describe("query persistence policy", () => {
  test("drops non-reader queries, expired rows, and extra entries beyond the cap", () => {
    const now = 1_700_000_000_000
    const pruned = pruneDehydratedState(
      {
        mutations: [{ mutationId: 1, state: {} } as never],
        queries: [
          dehydratedQuery(queryKeys.subscriptions.root(), now),
          dehydratedQuery(["session"], now),
          dehydratedQuery(queryKeys.entry.detail("stale"), now - PERSIST_MAX_AGE_MS - 1),
          ...Array.from({ length: PERSIST_MAX_LIST_QUERIES + 2 }, (_, index) =>
            dehydratedQuery(queryKeys.entries.timeline(0, false), now - index),
          ),
          ...Array.from({ length: PERSIST_MAX_ENTRY_DETAILS + 1 }, (_, index) =>
            dehydratedQuery(queryKeys.entry.detail(`entry-${index}`), now - index),
          ),
          ...Array.from({ length: PERSIST_MAX_ENTRY_SESSIONS + 1 }, (_, index) =>
            dehydratedQuery(queryKeys.entry.session(`entry-${index}`), now - index),
          ),
        ],
      },
      now,
    )

    expect(pruned.mutations).toEqual([])
    expect(pruned.queries).toHaveLength(
      PERSIST_MAX_LIST_QUERIES + PERSIST_MAX_ENTRY_DETAILS + PERSIST_MAX_ENTRY_SESSIONS,
    )
    expect(pruned.queries.some((query) => query.queryKey[0] === "subscriptions")).toBe(false)
    expect(pruned.queries.some((query) => query.queryKey[1] === "stale")).toBe(false)
  })

  test("does not overwrite newer in-memory query data", () => {
    const client = new QueryClient()
    client.setQueryData(queryKeys.entry.detail("entry-1"), { title: "live" }, { updatedAt: 200 })
    restoreQueriesIfNewer(client, {
      mutations: [],
      queries: [dehydratedQuery(queryKeys.entry.detail("entry-1"), 100, { title: "cached" })],
    })
    expect(client.getQueryData(queryKeys.entry.detail("entry-1"))).toEqual({ title: "live" })

    restoreQueriesIfNewer(client, {
      mutations: [],
      queries: [dehydratedQuery(queryKeys.entry.detail("entry-2"), 100, { title: "cached" })],
    })
    expect(client.getQueryData(queryKeys.entry.detail("entry-2"))).toEqual({ title: "cached" })
    client.clear()
  })
})

describe("query persistence store", () => {
  test("restores for the same user and wipes on logout, account change, or schema bump", async () => {
    const store = memoryPersistenceStore()
    const client = new QueryClient()
    writeSessionSnapshot({ email: "ada@example.com", name: "Ada", userId: "user-1" })

    client.setQueryData(queryKeys.entry.detail("entry-1"), { title: "Persisted" })
    const persistence = createQueryPersistence(client, store)
    await persistence.persist()

    const restoredClient = new QueryClient()
    await createQueryPersistence(restoredClient, store).restore()
    expect(restoredClient.getQueryData(queryKeys.entry.detail("entry-1"))).toEqual({
      title: "Persisted",
    })

    await persistence.clear()
    const afterLogout = new QueryClient()
    await createQueryPersistence(afterLogout, store).restore()
    expect(afterLogout.getQueryData(queryKeys.entry.detail("entry-1"))).toBeUndefined()

    await store.save({
      dehydrated: {
        mutations: [],
        queries: [dehydratedQuery(queryKeys.entry.detail("entry-1"), Date.now(), { title: "old" })],
      },
      userId: "user-1",
      version: PERSIST_SCHEMA_VERSION,
    })
    writeSessionSnapshot({ email: "other@example.com", name: "Other", userId: "user-2" })
    const switched = new QueryClient()
    await createQueryPersistence(switched, store).restore()
    expect(switched.getQueryData(queryKeys.entry.detail("entry-1"))).toBeUndefined()
    expect(await store.load()).toBeUndefined()

    await store.save({
      dehydrated: { mutations: [], queries: [] },
      userId: "user-2",
      version: 0,
    })
    await createQueryPersistence(new QueryClient(), store).restore()
    expect(await store.load()).toBeUndefined()
  })

  test("falls back to online-only memory after a quota failure", async () => {
    const client = new QueryClient()
    writeSessionSnapshot({ email: "ada@example.com", name: "Ada", userId: "user-1" })

    let saved = 0
    const store = memoryPersistenceStore()
    const persistence = createQueryPersistence(client, {
      clear: store.clear,
      load: store.load,
      save: async () => {
        saved += 1
        throw new Error("QuotaExceededError")
      },
    })
    client.setQueryData(queryKeys.entry.detail("entry-1"), { title: "A" })
    await persistence.persist()
    await persistence.persist()
    expect(saved).toBe(1)
  })

  test("only dehydrates successful reader queries", () => {
    const client = new QueryClient()
    client.setQueryData(queryKeys.entry.detail("entry-1"), { title: "ok" })
    const success = client.getQueryCache().find({ queryKey: queryKeys.entry.detail("entry-1") })
    expect(success && shouldDehydrateLiteQuery(success)).toBe(true)
    expect(persistableQueryKind(queryKeys.subscriptions.root())).toBeNull()
  })
})
