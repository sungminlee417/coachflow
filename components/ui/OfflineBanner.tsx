'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'
import { getQueueCount, subscribeQueue } from '@/lib/write-queue'

/**
 * Slim banner that appears at the top of the app whenever the browser
 * reports `navigator.onLine === false`. Saves the user from wondering why
 * "things look wrong" when their gym wifi drops — at least they know
 * what's happening. Also surfaces the count of queued writes so the user
 * sees "your last set is saved locally, syncing when you're back".
 *
 * `navigator.onLine` is best-effort: some networks claim "online" while
 * being effectively dead. That's fine here — a false positive just means
 * the banner doesn't show; the failing fetches still raise their own
 * errors. SSR returns `true` so the banner never flashes on first paint.
 */
function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

function getOnline() {
  return navigator.onLine
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true)
  const [queueCount, setQueueCount] = useState(0)

  // Track the queued-write count separately from the online state — we
  // want to surface "syncing X" briefly even after coming back online,
  // and the count is updated asynchronously after every enqueue / drain.
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getQueueCount().then(n => {
        if (!cancelled) setQueueCount(n)
      })
    }
    refresh()
    const unsubscribe = subscribeQueue(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // Don't render when everything's healthy. The banner shows whenever the
  // user is offline OR there are queued writes still draining — the
  // second case covers the "back online but the drain hasn't finished
  // yet" window.
  if (online && queueCount === 0) return null

  const message = !online
    ? queueCount > 0
      ? `You're offline. ${queueCount} ${queueCount === 1 ? 'change' : 'changes'} queued to sync when you're back.`
      : "You're offline. Showing cached content."
    : `Syncing ${queueCount} ${queueCount === 1 ? 'change' : 'changes'}…`

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-50 text-white text-xs font-medium px-4 py-1.5 flex items-center justify-center gap-2 shadow-sm ${
        online ? 'bg-emerald-600' : 'bg-amber-500'
      }`}
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      <WifiOff size={14} />
      <span>{message}</span>
    </div>
  )
}
