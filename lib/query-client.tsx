'use client'

// TanStack Query setup.
//
// One QueryClient per app instance, persisted to IndexedDB so:
//   • Queries served from cache when offline (replaces lib/cached-query).
//   • Mutations queued there persist across reloads, so a slow write
//     that gets interrupted by a tab close resumes on next mount
//     (replaces our hand-rolled write-queue).
//
// Defaults are tuned for a fitness app:
//   • `staleTime: 30s` — recent reads stay "fresh" so navigating between
//     Today and a deep view doesn't refetch immediately on every tab
//     switch. Mutations still invalidate explicitly when something
//     actually changed.
//   • `gcTime: 24h` — keep cached data around long enough to power
//     offline reads after the user returns the next day.
//   • `refetchOnWindowFocus: false` — coaches tab-switch constantly
//     (browser tabs, alt-tab to messages, lock screen on phone). Every
//     focus event firing a wave of refetches drowns the network and
//     causes empty-state flashes when stale cache rehydrates first.
//     Mutations already invalidate explicitly when something actually
//     changed, so stale-while-revalidate is plenty.
//   • `networkMode: 'offlineFirst'` — try the cache first; only fail a
//     query if there's no cache and we're offline.
//   • `retry` policy that gives up fast in the UI but lets the persister
//     replay the mutation later via `resumePausedMutations`.

import { useEffect, useState, type ReactNode } from 'react'
import {
  MutationCache,
  QueryCache,
  QueryClient,
  onlineManager,
} from '@tanstack/react-query'
import {
  PersistQueryClientProvider,
  type PersistedClient,
} from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'coachflow-query'
const STORE = 'cache'

let dbPromise: Promise<IDBPDatabase> | null = null
function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null
    const db = await getDb()
    return ((await db.get(STORE, key)) as string | undefined) ?? null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return
    const db = await getDb()
    await db.put(STORE, value, key)
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === 'undefined') return
    const db = await getDb()
    await db.delete(STORE, key)
  },
}

/** Called on logout — wipes the persisted query cache so the next user
 *  on this device doesn't inherit the previous user's data. */
export async function clearPersistedQueryCache(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const db = await getDb()
    await db.clear(STORE)
  } catch {
    // Non-fatal — if IDB is unavailable the cache wasn't persisted anyway.
  }
}

// JSON doesn't natively round-trip Map / Set — they stringify to `{}`
// and rehydrate as plain objects, which then crash any `for…of` or
// `.has()` call on the value. Wrap them with a discriminator on the
// way out and reconstruct on the way in. Anything else passes through
// untouched.
type MapTag = { __tag: 'Map'; entries: Array<[unknown, unknown]> }
type SetTag = { __tag: 'Set'; values: unknown[] }

function isTagged(v: unknown): v is MapTag | SetTag {
  return (
    typeof v === 'object' &&
    v !== null &&
    '__tag' in v &&
    typeof (v as { __tag: unknown }).__tag === 'string'
  )
}

function serializeWithCollections(data: PersistedClient): string {
  return JSON.stringify(data, (_key, value) => {
    if (value instanceof Map) {
      return { __tag: 'Map', entries: Array.from(value.entries()) } satisfies MapTag
    }
    if (value instanceof Set) {
      return { __tag: 'Set', values: Array.from(value.values()) } satisfies SetTag
    }
    return value
  })
}

function deserializeWithCollections(raw: string): PersistedClient {
  return JSON.parse(raw, (_key, value) => {
    if (!isTagged(value)) return value
    if (value.__tag === 'Map') return new Map(value.entries as Array<[unknown, unknown]>)
    if (value.__tag === 'Set') return new Set(value.values)
    return value
  }) as PersistedClient
}

function buildClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        networkMode: 'offlineFirst',
        retry: (failureCount, error) => {
          // Retry transient errors once; surface auth / validation
          // errors immediately.
          const msg = (error as Error | null)?.message?.toLowerCase() ?? ''
          if (/fetch|network|timeout|load failed/.test(msg)) {
            return failureCount < 2
          }
          return false
        },
      },
      mutations: {
        // `networkMode: 'offlineFirst'` lets mutations fire even when we
        // think we're online but they fail; failed mutations stay in the
        // cache and `resumePausedMutations()` retries them on reconnect.
        networkMode: 'offlineFirst',
        retry: 0,
      },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
  })
}

interface QueryProvidersProps {
  children: ReactNode
}

export function QueryProviders({ children }: QueryProvidersProps) {
  const [queryClient] = useState<QueryClient>(() => buildClient())
  const [persister] = useState(() =>
    createAsyncStoragePersister({
      storage: idbStorage,
      key: 'coachflow-query-cache',
      // Throttle persistence so heavy mutation traffic (set-by-set
      // logging) doesn't spam IDB writes.
      throttleTime: 1_000,
      // Default (de)serializer is plain JSON, which loses Map/Set
      // identity — caches built around either would rehydrate as `{}`
      // and crash consumers. Custom (de)serializer round-trips both.
      serialize: serializeWithCollections,
      deserialize: deserializeWithCollections,
    })
  )

  // Resume any mutations the persister rehydrates on mount — covers the
  // "slow request, tab closed, came back later" case the write-queue
  // used to handle. Also fires when the browser flips back online.
  useEffect(() => {
    queryClient.resumePausedMutations()
    return onlineManager.subscribe(online => {
      if (online) queryClient.resumePausedMutations()
    })
  }, [queryClient])

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        // Bump this if the shape of any cached query payload changes in
        // a way that would break a deserialised value. `v2` bust drops
        // any blobs persisted before the Map/Set-aware serializer landed
        // — those would rehydrate as `{}` and crash for-of loops.
        buster: 'v2',
        dehydrateOptions: {
          // Persist successful queries only — failed ones aren't useful
          // to rehydrate. We do want to persist *pending* mutations
          // (this is what gives us the write-ahead behaviour).
          shouldDehydrateQuery: q => q.state.status === 'success',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
