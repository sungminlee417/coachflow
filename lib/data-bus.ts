// Tiny pub-sub for "a slice of trainee data just changed". Any component
// that mutates one of the tracked entities (sets, weight entries, meal
// logs, measurements) calls `notifyDataChanged(topic)`; any component
// that reads/derives from that entity but lives elsewhere in the tree
// (notably the Today dashboard cards) subscribes via `subscribeDataChanged`
// and bumps its own refresh tick.
//
// We can't just rely on the offline-cache layer: when online,
// `cachedQuery` always re-fetches and overwrites the cache, but the
// dashboard cards only kick off that fetch when their effect deps change.
// Switching tabs doesn't change those deps, so without this bus a write
// from one tab stays invisible on another tab until next mount.

export type DataTopic =
  | 'set_logs'
  | 'meal_logs'
  | 'weight_logs'
  | 'body_measurements'

const listeners = new Map<DataTopic, Set<() => void>>()

export function notifyDataChanged(topic: DataTopic): void {
  const set = listeners.get(topic)
  if (!set) return
  // Snapshot so a subscriber that unsubscribes during emit doesn't shift
  // the iteration.
  for (const fn of [...set]) fn()
}

export function subscribeDataChanged(
  topic: DataTopic,
  fn: () => void
): () => void {
  let set = listeners.get(topic)
  if (!set) {
    set = new Set()
    listeners.set(topic, set)
  }
  set.add(fn)
  return () => {
    set!.delete(fn)
  }
}
