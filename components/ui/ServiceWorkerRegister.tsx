'use client'

import { useEffect } from 'react'

/**
 * Registers `/sw.js` on mount in production. Dev mode is skipped because
 * Next.js dev server serves chunks the SW would happily cache, then the
 * next hot reload would deliver a different chunk hash and the SW would
 * have to be busted manually — fine for users, painful for the developer.
 *
 * The SW itself handles cache versioning + cleanup; this component just
 * kicks off registration and reloads the page once when a brand-new SW
 * takes control, so the first visit after deploying a new version picks
 * up the latest cached shell without forcing a manual refresh.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    let refreshedOnce = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // controllerchange fires when a new SW takes over after skipWaiting.
      // Reload once so the new chunks are picked up cleanly.
      if (refreshedOnce) return
      refreshedOnce = true
      window.location.reload()
    })

    navigator.serviceWorker.register('/sw.js').catch(err => {
      // Registration failures are non-fatal — log and move on.
      console.warn('[sw] registration failed', err)
    })
  }, [])

  return null
}
