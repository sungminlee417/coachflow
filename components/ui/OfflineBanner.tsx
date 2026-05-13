'use client'

import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Slim banner that appears at the top of the app whenever the browser
 * reports `navigator.onLine === false`. Saves the user from wondering why
 * "things look wrong" when their gym wifi drops — at least they know
 * what's happening.
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

  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs font-medium px-4 py-1.5 flex items-center justify-center gap-2 shadow-sm"
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      <WifiOff size={14} />
      <span>You&rsquo;re offline. Showing cached content.</span>
    </div>
  )
}
