// CoachFlow service worker — hand-written, no framework deps.
//
// Strategy:
//   • App shell (Next.js JS/CSS chunks, fonts, icons) → cache-first with
//     background revalidate. Fast loads, always falls back to the network on
//     first miss, eventually serves cached copies offline.
//   • Navigation HTML → network-first. If the network call fails we serve
//     the last successful navigation for that URL, then fall back to a
//     bundled /offline.html. Authenticated pages render different HTML per
//     user so we never cache aggressively — only the most recent response.
//   • Supabase API + auth → passthrough. We never intercept these in the SW;
//     read-caching happens in app code (idb layer) where we can reason
//     about staleness per-table. Auth state must never be served stale.
//
// Bump CACHE_VERSION whenever the offline shell or fallback page changes.
// Old caches are dropped on activate.

const CACHE_VERSION = 'v2'
const SHELL_CACHE = `coachflow-shell-${CACHE_VERSION}`
const NAV_CACHE = `coachflow-nav-${CACHE_VERSION}`

const PRECACHE_URLS = ['/offline.html', '/manifest.webmanifest', '/favicon.ico']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(PRECACHE_URLS))
  )
  // Activate immediately so a returning user gets the new SW on next load
  // rather than the one after that. Paired with `clients.claim()` below.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter(k => !k.endsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

function isShellRequest(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.webmanifest'
  )
}

function isSupabaseRequest(url) {
  // Supabase REST + Realtime + Auth endpoints live on *.supabase.co.
  // We intentionally don't cache these — see file header.
  return url.hostname.endsWith('.supabase.co')
}

self.addEventListener('fetch', event => {
  const { request } = event

  // Only handle GETs — POST/PUT/DELETE go straight to the network (and
  // we definitely don't want to cache mutations).
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Don't touch cross-origin requests we don't own (analytics, Supabase, etc).
  if (url.origin !== self.location.origin) return
  if (isSupabaseRequest(url)) return

  // Cache-first for static shell assets.
  if (isShellRequest(url)) {
    event.respondWith(cacheFirstWithRevalidate(request, SHELL_CACHE))
    return
  }

  // Network-first for HTML page loads.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }
})

async function cacheFirstWithRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(response => {
      // Only cache successful, basic responses. Opaque/error responses are
      // useless as a fallback and just bloat storage.
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {})
      }
      return response
    })
    .catch(() => undefined)
  return cached || (await network) || Response.error()
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(NAV_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch {
    // Exact match first (e.g. /dashboard?tab=my-workouts).
    let cached = await cache.match(request)
    // Then fall back to any cached variant of this pathname — the dashboard
    // is URL-driven via `?tab=...`, so a user who only visited /dashboard
    // online still gets a real app shell back for /dashboard?tab=something.
    // The active tab re-derives client-side from useSearchParams so the
    // wrong-tab flash self-corrects on hydration.
    if (!cached) {
      cached = await cache.match(request, { ignoreSearch: true })
    }
    if (cached) return cached
    const offline = await caches.match('/offline.html')
    return (
      offline ||
      new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      })
    )
  }
}

// Allow the app to wipe SW caches on signout so the next user logging in on
// this device doesn't see the previous user's cached dashboard HTML.
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      })()
    )
  }
})
