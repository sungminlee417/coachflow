'use client'

import { useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'

/**
 * Listens for Supabase auth state changes and redirects to `/login` when
 * the session dies — covers the long-idle-tab case where the user comes
 * back hours later, the refresh token has expired, and every subsequent
 * mutation would otherwise return "Failed to save" with no recovery path.
 *
 * Two triggers:
 *   1. `onAuthStateChange` → SIGNED_OUT (or TOKEN_REFRESHED with no
 *      session) fires when the client decides the session is over.
 *   2. `visibilitychange` → on tab-becomes-visible we proactively call
 *      `getUser()`. If it returns no user *and* we're online, we know
 *      the session is dead before the user tries to log anything.
 *
 * Offline is intentionally a no-op — `navigator.onLine === false` means
 * a failed auth check is from network, not from a real signout, and we
 * shouldn't punt the user to /login while they're mid-gym with no signal.
 *
 * Mounts inside the dashboard layer (not the marketing pages) so the
 * auth-change listener only runs where there's a session to lose.
 */
export function AuthGuard() {
  const supabase = useSupabase()

  useEffect(() => {
    let redirected = false
    const goToLogin = () => {
      if (redirected) return
      redirected = true
      // Hard navigation so the server-side middleware + dashboard guard
      // both re-run on the next page (catches cookie/cache mismatches).
      window.location.href = '/login'
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        goToLogin()
        return
      }
      // A TOKEN_REFRESHED with no session means refresh failed —
      // Supabase reports the event with `session: null` in that case.
      if (event === 'TOKEN_REFRESHED' && !session) {
        goToLogin()
      }
    })

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      // Skip if the browser thinks we're offline — a failed `getUser()`
      // would be a false positive and bounce the user mid-workout.
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) goToLogin()
      } catch {
        // Network or transient error — leave the user alone, the
        // auth-state listener will fire if the session is truly dead.
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [supabase])

  return null
}
