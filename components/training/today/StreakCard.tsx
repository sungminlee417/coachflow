'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'
import { todayISO } from '@/lib/utils'
import { Card, CardSkeletonBody, shiftISO } from './primitives'

export function StreakCard({
  clientId,
  onOpen,
}: {
  clientId: string
  onOpen: () => void
}) {
  const supabase = useSupabase()
  // Lifetime-ish aggregate; the save mutation invalidates this key
  // automatically, so the streak refreshes after every logged set.
  const streakQuery = useQuery({
    queryKey: queryKeys.setLogs.streak(clientId),
    queryFn: async (): Promise<Array<{ logged_date: string }>> => {
      const { data, error } = await supabase
        .from('set_logs')
        .select('logged_date')
        .eq('completed', true)
        .order('logged_date', { ascending: false })
        .limit(60)
      if (error) throw error
      return (data ?? []) as Array<{ logged_date: string }>
    },
  })

  // Treat a stale-empty cache as "still loading" — otherwise "Log a
  // workout today to start a streak" flashes before the refetch
  // resolves with the real history. `isStale` covers the brief gap
  // between IndexedDB rehydration and the refetch actually starting.
  const streakStale =
    (streakQuery.data?.length ?? 0) === 0 &&
    (streakQuery.isFetching || streakQuery.isStale)

  const { streak, thisWeek } = useMemo(() => {
    if (!streakQuery.data || streakStale)
      return { streak: null as number | null, thisWeek: 0 }
    const dates = new Set(streakQuery.data.map(r => r.logged_date))
    const today = todayISO()
    let s = 0
    let cursor = today
    if (!dates.has(cursor)) {
      // Today not yet logged — anchor on yesterday so a streak only
      // breaks once the day actually ends.
      cursor = shiftISO(cursor, -1)
    }
    while (dates.has(cursor)) {
      s += 1
      cursor = shiftISO(cursor, -1)
    }
    let week = 0
    for (let i = 0; i < 7; i++) {
      if (dates.has(shiftISO(today, -i))) week += 1
    }
    return { streak: s, thisWeek: week }
  }, [streakQuery.data, streakStale])

  return (
    <Card onClick={onOpen} accent="purple" icon={Flame} label="Streak">
      {streak === null ? (
        <CardSkeletonBody lines={1} />
      ) : streak === 0 ? (
        <p className="text-sm text-muted">
          Log a workout today to start a streak.
        </p>
      ) : (
        // Vertical stack — at half-width on phones, the old
        // horizontal "{N} days in a row · X/7 this week" row wrapped
        // and looked squished. Big number on top, supporting label
        // below, week count as a small footer pill.
        <div>
          <p className="font-semibold text-foreground leading-none">
            <span className="text-3xl tabular-nums">{streak}</span>
            <span className="text-xs text-muted font-normal ml-1">
              {streak === 1 ? 'day' : 'days'}
            </span>
          </p>
          <p className="text-[11px] text-muted mt-2 tabular-nums">
            {thisWeek}/7 this week
          </p>
        </div>
      )}
    </Card>
  )
}
