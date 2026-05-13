// Tiny IndexedDB-backed key/value cache for offline read fallback.
//
// Why IDB and not localStorage:
//   • Async (won't jank the main thread on big payloads).
//   • Structured-clone storage — we can persist objects/arrays directly.
//   • Larger quota than localStorage's ~5MB.
//
// Why `idb` rather than raw IndexedDB:
//   • Native IDB is callback-based and verbose. `idb` is a 1KB promise
//     wrapper from the Chrome team. The wrapper itself just forwards to
//     native APIs, so it's about as future-proof as raw IDB.
//
// Failure mode: IDB is unavailable in some private windows and a few
// embedded WebViews. Every public function here resolves to a benign value
// instead of throwing so callers can always proceed — the worst case is no
// offline fallback, not a crash.

import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'coachflow-cache'
// Bumped to v2 when the write-queue store was added. Bump again whenever
// another store is introduced — the `upgrade` callback below creates only
// stores that don't already exist, so re-runs across versions are safe.
const DB_VERSION = 2
const STORE_NAME = 'queries'
export const WRITE_QUEUE_STORE = 'write_queue'

interface CachedEntry<T> {
  key: string
  data: T
  cachedAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB() {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains(WRITE_QUEUE_STORE)) {
          // `id` is the primary key; we also use a `createdAt` index so the
          // drain loop can replay in FIFO order across reloads.
          const store = db.createObjectStore(WRITE_QUEUE_STORE, {
            keyPath: 'id',
          })
          store.createIndex('createdAt', 'createdAt')
        }
      },
    }).catch(err => {
      console.warn('[offline-cache] failed to open IDB', err)
      // Reset so a later call can retry — e.g. if a temporary lock cleared.
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

export async function readCache<T>(key: string): Promise<CachedEntry<T> | null> {
  try {
    const db = await getDB()
    if (!db) return null
    return ((await db.get(STORE_NAME, key)) as CachedEntry<T> | undefined) ?? null
  } catch {
    return null
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const db = await getDB()
    if (!db) return
    await db.put(STORE_NAME, { key, data, cachedAt: Date.now() })
  } catch {
    // Quota exceeded / disabled storage — silently drop.
  }
}

/**
 * Clear every cached entry and any pending queued writes. Call this on
 * signout so the next user doesn't inherit the previous user's offline
 * snapshot OR the previous session's unsynced mutations (which would now
 * be rejected by the auth context anyway).
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await getDB()
    if (!db) return
    await db.clear(STORE_NAME)
    if (db.objectStoreNames.contains(WRITE_QUEUE_STORE)) {
      await db.clear(WRITE_QUEUE_STORE)
    }
  } catch {
    // No-op on failure.
  }
}
