// Cache-on-fail wrapper for Supabase reads.
//
// Behavior:
//   • If `navigator.onLine` is false, short-circuit: return the cached value
//     immediately, skipping a doomed fetch (iOS Safari can hang for 30s on
//     a dead origin otherwise).
//   • Otherwise run the query. On a successful response, write the result
//     to IDB and return it.
//   • On any network/Supabase error, fall back to the most recent cached
//     value. If there's no cache either, surface the live error.
//
// Use only for read-only queries the user should be able to view offline
// (today's workout, weight history, profile). NEVER use for mutations,
// auth state, or anything whose freshness matters per-request.

import { readCache, writeCache } from './offline-cache'

interface SupabaseResult<T> {
  data: T | null
  error: { message: string } | null
}

export interface CachedResult<T> extends SupabaseResult<T> {
  /** True when `data` was served from IDB rather than the live query. */
  fromCache: boolean
}

function describeError(err: unknown): { message: string } {
  if (err instanceof Error) return { message: err.message }
  if (typeof err === 'object' && err && 'message' in err) {
    return { message: String((err as { message: unknown }).message) }
  }
  return { message: 'Network error' }
}

async function offlineFallback<T>(key: string): Promise<CachedResult<T>> {
  const cached = await readCache<T>(key)
  if (cached) return { data: cached.data, error: null, fromCache: true }
  return {
    data: null,
    error: { message: "You're offline and no cached copy is available yet." },
    fromCache: false,
  }
}

function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export async function cachedQuery<T>(
  key: string,
  // PromiseLike, not Promise: Supabase's query builder is thenable but
  // lacks .catch/.finally, so a strict Promise<...> signature rejects it.
  query: () => PromiseLike<SupabaseResult<T>>
): Promise<CachedResult<T>> {
  // Fast path: known offline → don't bother with the network roundtrip.
  if (isOffline()) return offlineFallback<T>(key)

  // Online (or SSR): try the live query.
  let liveError: { message: string } | null = null
  try {
    const result = await query()
    if (!result.error && result.data !== null) {
      // Persist successful payloads. Empty arrays are valid and worth
      // caching; only `null` skips so we don't pin "no data" as a
      // stale state.
      await writeCache(key, result.data)
      return { data: result.data, error: null, fromCache: false }
    }
    if (result.error) liveError = result.error
    else return { data: result.data, error: null, fromCache: false }
  } catch (err) {
    liveError = describeError(err)
  }

  // Live query reported an error — try the cache as a fallback before
  // surfacing the failure.
  const cached = await readCache<T>(key)
  if (cached) {
    return { data: cached.data, error: null, fromCache: true }
  }
  return { data: null, error: liveError ?? { message: 'Unknown error' }, fromCache: false }
}

/**
 * Same caching contract as `cachedQuery`, but for promise-returning helpers
 * that throw on failure (e.g. the typed functions in lib/queries.ts).
 */
export async function cachedFetch<T>(
  key: string,
  fn: () => Promise<T>
): Promise<CachedResult<T>> {
  if (isOffline()) return offlineFallback<T>(key)
  try {
    const result = await fn()
    if (result !== null && result !== undefined) {
      await writeCache(key, result)
    }
    return { data: result, error: null, fromCache: false }
  } catch (err) {
    const cached = await readCache<T>(key)
    if (cached) return { data: cached.data, error: null, fromCache: true }
    return { data: null, error: describeError(err), fromCache: false }
  }
}
