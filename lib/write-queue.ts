// Write queue for offline mutations.
//
// When a mutation runs while offline (or fails with a network error), we
// stash the intent in IDB and return success to the caller so optimistic
// UI keeps working. On the next `online` event — or on app mount — we
// replay the queue in FIFO order. Anything that succeeds is removed;
// anything that fails stays for the next attempt.
//
// SCOPE: only `upsert` operations today, because that's all the set-logger
// uses and the user's reported pain. Add `insert`/`update`/`delete`
// shapes as needed when wrapping more mutations.
//
// Limitations worth knowing:
//   • Last-write-wins. If the queue holds two upserts for the same row,
//     replay applies them in order and the later one wins. Fine for set
//     logs (the user just typed the final value).
//   • No conflict detection across devices. If the same user logs from
//     two phones simultaneously, the most recent write wins server-side.
//   • Auth lives in the live Supabase cookie. If the token expires while
//     queued writes wait, replay will fail with a 401 — the entry stays
//     queued. A future iteration could surface "sign back in to sync".
//   • Cleared on signout (see offline-cache.clearCache).
//
// Persisted shape (`QueueEntry`):
//   { id, op: { kind, table, payload, onConflict }, createdAt, attempts, lastError }

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDB, WRITE_QUEUE_STORE } from './offline-cache'

export interface UpsertOp {
  kind: 'upsert'
  table: string
  payload: Record<string, unknown>
  onConflict?: string
}

export type QueuedOp = UpsertOp

interface QueueEntry {
  id: string
  op: QueuedOp
  createdAt: number
  attempts: number
  lastError: string | null
}

const subscribers = new Set<() => void>()
function notify() {
  subscribers.forEach(fn => fn())
}

export function subscribeQueue(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

function makeId() {
  // Don't rely on crypto.randomUUID for older browsers; this is fine for a
  // local-only queue id.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function enqueueWrite(op: QueuedOp): Promise<void> {
  const db = await getDB()
  if (!db) return
  const entry: QueueEntry = {
    id: makeId(),
    op,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  }
  await db.put(WRITE_QUEUE_STORE, entry)
  notify()
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB()
  if (!db) return 0
  try {
    return await db.count(WRITE_QUEUE_STORE)
  } catch {
    return 0
  }
}

async function listQueueByAge(): Promise<QueueEntry[]> {
  const db = await getDB()
  if (!db) return []
  try {
    // Use the createdAt index so replay is FIFO even across page reloads.
    return (await db.getAllFromIndex(WRITE_QUEUE_STORE, 'createdAt')) as QueueEntry[]
  } catch {
    return []
  }
}

async function deleteEntry(id: string) {
  const db = await getDB()
  if (!db) return
  try {
    await db.delete(WRITE_QUEUE_STORE, id)
  } catch {
    // Non-fatal — drain will see the still-present entry next time.
  }
}

async function bumpAttempt(entry: QueueEntry, errorMessage: string) {
  const db = await getDB()
  if (!db) return
  try {
    await db.put(WRITE_QUEUE_STORE, {
      ...entry,
      attempts: entry.attempts + 1,
      lastError: errorMessage,
    })
  } catch {
    // Non-fatal.
  }
}

async function runOp(supabase: SupabaseClient, op: QueuedOp) {
  if (op.kind === 'upsert') {
    return supabase
      .from(op.table)
      .upsert(op.payload, op.onConflict ? { onConflict: op.onConflict } : undefined)
  }
  throw new Error(`Unsupported queued op kind: ${(op as { kind: string }).kind}`)
}

function isNetworkError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('fetch') ||
    m.includes('network') ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('timeout')
  )
}

let draining: Promise<{ replayed: number; failed: number }> | null = null

export async function drainQueue(
  supabase: SupabaseClient
): Promise<{ replayed: number; failed: number }> {
  // Coalesce overlapping callers (online event + mount + manual trigger
  // can race) so we don't double-apply queued writes.
  if (draining) return draining
  draining = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { replayed: 0, failed: 0 }
    }
    const entries = await listQueueByAge()
    let replayed = 0
    let failed = 0
    for (const entry of entries) {
      try {
        const { error } = await runOp(supabase, entry.op)
        if (error) {
          // A real Supabase-side error (validation, auth) won't fix itself
          // by retrying. If it looks like a transient connectivity issue
          // we leave it for the next online event; otherwise drop it so
          // the queue can't get stuck on a poison entry. The threshold
          // gives us a few retries' grace for flaky cases.
          if (isNetworkError(error.message) && entry.attempts < 5) {
            await bumpAttempt(entry, error.message)
            failed++
            // Stop the loop on the first transient failure — almost
            // certainly the next entries will hit the same problem and
            // we'd just stack retries.
            break
          }
          await bumpAttempt(entry, error.message)
          if (entry.attempts + 1 >= 5) {
            // Five strikes: drop it so it stops blocking the queue.
            await deleteEntry(entry.id)
          }
          failed++
          continue
        }
        await deleteEntry(entry.id)
        replayed++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (isNetworkError(message) && entry.attempts < 5) {
          await bumpAttempt(entry, message)
          failed++
          break
        }
        await bumpAttempt(entry, message)
        if (entry.attempts + 1 >= 5) {
          await deleteEntry(entry.id)
        }
        failed++
      }
    }
    if (replayed > 0 || failed > 0) notify()
    return { replayed, failed }
  })()
  try {
    return await draining
  } finally {
    draining = null
  }
}

/**
 * Try to upsert live. If we're offline or the call fails with a network
 * error, queue it for later and report success to the caller so optimistic
 * UI continues to render. Non-network errors (validation, permission,
 * conflict) are surfaced as a normal Supabase error envelope.
 *
 * Returns `{ error: null, queued: true }` when the write was queued.
 */
export async function queuedUpsert(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  options?: { onConflict?: string }
): Promise<{ error: { message: string } | null; queued: boolean }> {
  const op: UpsertOp = {
    kind: 'upsert',
    table,
    payload,
    onConflict: options?.onConflict,
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueWrite(op)
    return { error: null, queued: true }
  }
  try {
    const { error } = await runOp(supabase, op)
    if (!error) return { error: null, queued: false }
    if (isNetworkError(error.message)) {
      await enqueueWrite(op)
      return { error: null, queued: true }
    }
    return { error: { message: error.message }, queued: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (isNetworkError(message)) {
      await enqueueWrite(op)
      return { error: null, queued: true }
    }
    return { error: { message }, queued: false }
  }
}
