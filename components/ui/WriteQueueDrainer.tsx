'use client'

import { useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { drainQueue } from '@/lib/write-queue'

/**
 * Triggers a drain of the offline write queue on mount and every time the
 * browser fires the `online` event. Lives at the dashboard layer so it
 * only runs while authenticated — there's no Supabase client to drain
 * against on the public login/signup pages.
 *
 * The drain function itself coalesces overlapping callers, so firing on
 * both events (and on tab visibility changes if we ever add that) is
 * safe — only one replay loop runs at a time.
 */
export function WriteQueueDrainer() {
  const supabase = useSupabase()

  useEffect(() => {
    // Best-effort drain on mount — covers the case where the user
    // reloaded the tab while still online and has queued writes left
    // over from a previous offline session.
    drainQueue(supabase)

    const handleOnline = () => {
      drainQueue(supabase)
    }
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [supabase])

  return null
}
