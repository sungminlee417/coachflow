'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'
import { useMealLogs } from '@/lib/hooks/use-meal-logs'
import { useDaySetLogs } from '@/lib/hooks/use-set-logs'
import {
  useMealPlanAssignments,
  useWorkoutAssignments,
} from '@/lib/hooks/use-assignments'
import { Pill, shiftISO } from './primitives'

/**
 * Quick "vital signs" strip rendered just below the greeting. Three
 * compact pills surface today's most-checked numbers — streak, sets
 * done, meals eaten — so the user gets a sense of momentum without
 * scanning every card. Each pill is data-light by design: we reuse
 * queries the cards below already issue, so this adds no extra fetches
 * (TanStack dedupes identical query keys).
 */
export function HeroStats({
  clientId,
  loggedDate,
}: {
  clientId: string
  loggedDate: string
}) {
  const supabase = useSupabase()
  // Streak — same query the StreakCard uses, dedupes via the cache.
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
  const streakDays = useMemo(() => {
    if (!streakQuery.data) return 0
    const dates = new Set(streakQuery.data.map(r => r.logged_date))
    let cursor = loggedDate
    if (!dates.has(cursor)) cursor = shiftISO(cursor, -1)
    let n = 0
    while (dates.has(cursor)) {
      n += 1
      cursor = shiftISO(cursor, -1)
    }
    return n
  }, [streakQuery.data, loggedDate])

  // Sets done today + total prescribed — needs assignments + day logs.
  const assignmentsQuery = useWorkoutAssignments(clientId, loggedDate)
  const assignmentIds = useMemo(
    () => (assignmentsQuery.data ?? []).map(a => a.id),
    [assignmentsQuery.data]
  )
  const setLogsQuery = useDaySetLogs({ clientId, date: loggedDate, assignmentIds })
  const { setsDone, setsTotal } = useMemo(() => {
    const assignments = assignmentsQuery.data ?? []
    let total = 0
    for (const a of assignments) {
      for (const ex of a.workout.exercises ?? []) {
        total += ex.exercise_sets?.length ?? ex.sets ?? 0
      }
    }
    let done = 0
    for (const [, row] of setLogsQuery.data ?? new Map()) {
      if (row.completed) done += 1
    }
    return { setsDone: done, setsTotal: total }
  }, [assignmentsQuery.data, setLogsQuery.data])

  // Meals — eaten count vs total scheduled for today.
  const mealAssignments = useMealPlanAssignments(clientId, loggedDate)
  const mealLogs = useMealLogs({ clientId, date: loggedDate })
  const { mealsEaten, mealsTotal } = useMemo(() => {
    let total = 0
    for (const a of mealAssignments.data ?? []) {
      for (const m of a.meal_plan.meals) if (m.id) total += 1
    }
    return { mealsEaten: mealLogs.data?.size ?? 0, mealsTotal: total }
  }, [mealAssignments.data, mealLogs.data])

  // Hide the strip entirely when there's nothing useful to surface —
  // a fresh account with no streak, no workout, no meals would just
  // show three "0 / 0" pills, which feels like a chore. But while any
  // source query is still revalidating an all-zero snapshot, render a
  // skeleton placeholder so a returning user with content doesn't watch
  // the strip pop in (and doesn't see "0/0" flicker either).
  // Any source not yet confirmed fresh — `isFetching` covers in-flight
  // refetches, `isStale` covers the gap between rehydration and the
  // refetch starting. Either keeps the strip mounted (as a skeleton)
  // so it doesn't pop in mid-render for returning users with content.
  const anyFetching =
    streakQuery.isFetching ||
    streakQuery.isStale ||
    assignmentsQuery.isFetching ||
    assignmentsQuery.isStale ||
    setLogsQuery.isFetching ||
    setLogsQuery.isStale ||
    mealAssignments.isFetching ||
    mealAssignments.isStale ||
    mealLogs.isFetching ||
    mealLogs.isStale
  const allZero = streakDays === 0 && setsTotal === 0 && mealsTotal === 0
  if (allZero && !anyFetching) return null
  if (allZero && anyFetching) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-6 w-24 rounded-full bg-line/70 animate-pulse" />
        <div className="h-6 w-20 rounded-full bg-line/70 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Pill icon="🔥" label={`${streakDays}-day streak`} tone="amber" />
      {setsTotal > 0 && (
        <Pill
          icon="💪"
          label={`${setsDone}/${setsTotal} sets`}
          tone={setsDone >= setsTotal && setsTotal > 0 ? 'emerald' : 'indigo'}
        />
      )}
      {mealsTotal > 0 && (
        <Pill
          icon="🍳"
          label={`${mealsEaten}/${mealsTotal} meals`}
          tone={mealsEaten >= mealsTotal && mealsTotal > 0 ? 'emerald' : 'purple'}
        />
      )}
    </div>
  )
}
