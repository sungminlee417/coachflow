'use client'

// Offline / sync banner.
//
// Two surfacing rules:
//   • Browser reports `navigator.onLine === false` → show "You're
//     offline" so the user knows why things look wrong.
//   • There are in-flight (or paused) mutations — could be writes
//     waiting on reconnect from TanStack Query's mutation queue, or
//     just normal saves still mid-roundtrip. We surface the count so
//     "your last set is saved locally, syncing soon" reads correctly
//     even after coming back online while the queue drains.

import { useSyncExternalStore } from 'react'
import { WifiOff } from 'lucide-react'
import { useIsMutating } from '@tanstack/react-query'

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
  // `useIsMutating` counts pending mutations across the whole client —
  // includes ones paused offline + ones currently in-flight. Exactly
  // what we want to show as "still syncing".
  const pendingMutations = useIsMutating()

  if (online && pendingMutations === 0) return null

  const message = !online
    ? pendingMutations > 0
      ? `You're offline. ${pendingMutations} ${pendingMutations === 1 ? 'change' : 'changes'} queued to sync when you're back.`
      : "You're offline. Showing cached content."
    : `Syncing ${pendingMutations} ${pendingMutations === 1 ? 'change' : 'changes'}…`

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
