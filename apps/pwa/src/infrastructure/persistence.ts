import type { DehydratedState, Query, QueryClient } from "@tanstack/react-query"
import { dehydrate, hydrate } from "@tanstack/react-query"

import { persistableQueryKind } from "../domain/query-keys"
import { readSessionSnapshot } from "./session-snapshot"

export const PERSIST_SCHEMA_VERSION = 1
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const PERSIST_MAX_LIST_QUERIES = 8
export const PERSIST_MAX_ENTRY_DETAILS = 24
export const PERSIST_MAX_ENTRY_SESSIONS = 40
export const PERSIST_DEBOUNCE_MS = 500

export type PersistedQueryCache = {
  dehydrated: DehydratedState
  userId: string
  version: number
}

export type PersistenceStore = {
  clear(): Promise<void>
  load(): Promise<PersistedQueryCache | undefined>
  save(value: PersistedQueryCache): Promise<void>
}

const DB_NAME = "folo-lite-query-cache"
const STORE_NAME = "kv"
const STATE_KEY = "state"

export const memoryPersistenceStore = (): PersistenceStore => {
  let value: PersistedQueryCache | undefined
  return {
    clear: async () => {
      value = undefined
    },
    load: async () => value,
    save: async (next) => {
      value = next
    },
  }
}

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })

const openPersistenceDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, PERSIST_SCHEMA_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (db.objectStoreNames.contains(STORE_NAME)) db.deleteObjectStore(STORE_NAME)
      db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"))
  })

export const indexedDbPersistenceStore = (): PersistenceStore => ({
  clear: async () => {
    if (typeof indexedDB === "undefined") return
    const db = await openPersistenceDb()
    try {
      await requestToPromise(
        db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(STATE_KEY),
      )
    } finally {
      db.close()
    }
  },
  load: async () => {
    if (typeof indexedDB === "undefined") return undefined
    const db = await openPersistenceDb()
    try {
      const value = await requestToPromise(
        db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY),
      )
      return value as PersistedQueryCache | undefined
    } finally {
      db.close()
    }
  },
  save: async (value) => {
    if (typeof indexedDB === "undefined") return
    const db = await openPersistenceDb()
    try {
      await requestToPromise(
        db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, STATE_KEY),
      )
    } finally {
      db.close()
    }
  },
})

const limits = {
  detail: PERSIST_MAX_ENTRY_DETAILS,
  list: PERSIST_MAX_LIST_QUERIES,
  session: PERSIST_MAX_ENTRY_SESSIONS,
} as const

export const pruneDehydratedState = (
  dehydrated: DehydratedState,
  now = Date.now(),
): DehydratedState => {
  const live = dehydrated.queries.filter((query) => {
    if (!persistableQueryKind(query.queryKey)) return false
    if (query.state.data === undefined) return false
    const updatedAt = query.state.dataUpdatedAt ?? 0
    return now - updatedAt <= PERSIST_MAX_AGE_MS
  })

  const take = (kind: keyof typeof limits) =>
    live
      .filter((query) => persistableQueryKind(query.queryKey) === kind)
      .slice()
      .sort((left, right) => (right.state.dataUpdatedAt ?? 0) - (left.state.dataUpdatedAt ?? 0))
      .slice(0, limits[kind])

  return {
    mutations: [],
    queries: [...take("list"), ...take("detail"), ...take("session")],
  }
}

export const shouldDehydrateLiteQuery = (query: Query) =>
  persistableQueryKind(query.queryKey) !== null && query.state.status === "success"

export const restoreQueriesIfNewer = (client: QueryClient, incoming: DehydratedState) => {
  const queries = incoming.queries.filter((query) => {
    if (!persistableQueryKind(query.queryKey)) return false
    const current = client.getQueryState(query.queryKey)
    if (current?.dataUpdatedAt && current.dataUpdatedAt >= (query.state.dataUpdatedAt ?? 0)) {
      return false
    }
    return true
  })
  if (queries.length === 0) return
  hydrate(client, { mutations: [], queries })
}

export const createQueryPersistence = (
  queryClient: QueryClient,
  store: PersistenceStore = indexedDbPersistenceStore(),
) => {
  let persistEnabled = true
  let timer = 0

  const persist = async () => {
    if (!persistEnabled) return
    const snapshot = readSessionSnapshot()
    if (!snapshot) return
    const dehydrated = pruneDehydratedState(
      dehydrate(queryClient, { shouldDehydrateQuery: shouldDehydrateLiteQuery }),
    )
    try {
      await store.save({
        dehydrated,
        userId: snapshot.userId,
        version: PERSIST_SCHEMA_VERSION,
      })
    } catch {
      persistEnabled = false
    }
  }

  const restore = async () => {
    try {
      const cached = await store.load()
      if (!cached) return
      if (cached.version !== PERSIST_SCHEMA_VERSION) {
        await store.clear()
        return
      }
      const snapshot = readSessionSnapshot()
      if (!snapshot || snapshot.userId !== cached.userId) {
        await store.clear()
        return
      }
      restoreQueriesIfNewer(queryClient, cached.dehydrated)
    } catch {
      persistEnabled = false
    }
  }

  const schedulePersist = () => {
    if (typeof window === "undefined") {
      void persist()
      return
    }
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      void persist()
    }, PERSIST_DEBOUNCE_MS)
  }

  const subscribe = () => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" && event.type !== "removed") return
      schedulePersist()
    })
    const onHidden = () => {
      if (document.visibilityState === "hidden") void persist()
    }
    document.addEventListener("visibilitychange", onHidden)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onHidden)
      unsubscribe()
    }
  }

  const clear = async () => {
    window.clearTimeout(timer)
    persistEnabled = true
    await store.clear()
  }

  return { clear, persist, restore, subscribe }
}
