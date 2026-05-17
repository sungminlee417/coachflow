'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Clock, Utensils } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
import { useMealLogs, useToggleMealLog } from '@/lib/hooks/use-meal-logs'
import { useMealPlanAssignments } from '@/lib/hooks/use-assignments'
import { mealDisplayName, numberMealsForDay } from '@/lib/utils'
import { Card, CardEmpty, CardSkeletonBody, ProgressBar } from './primitives'

const EMPTY_EATEN_SET: Set<string> = new Set()

export function MealsCard({
  clientId,
  loggedDate,
  onOpen,
}: {
  clientId: string
  loggedDate: string
  onOpen: () => void
}) {
  const assignmentsQuery = useMealPlanAssignments(clientId, loggedDate)
  const assignments = assignmentsQuery.data ?? null
  // Two-tier loading. `loading` covers the fresh-fetch case. We also keep
  // the skeleton up when the cache served us empty data that hasn't been
  // confirmed fresh yet — `isFetching` covers the in-flight refetch, and
  // `isStale` covers the brief gap between IndexedDB rehydration and the
  // refetch actually starting. Without the `isStale` guard "No meals
  // planned" flashes for a frame on cold open.
  const loading = assignmentsQuery.isLoading
  const revalidatingEmpty =
    (assignments?.length ?? 0) === 0 &&
    (assignmentsQuery.isFetching || assignmentsQuery.isStale)
  // Eaten state comes from TanStack Query — shared with the deep
  // meal-plan view and per-row MealLogToggles. Toggle optimistically
  // updates the same cache so everything stays in sync without re-fetch.
  const mealLogs = useMealLogs({ clientId, date: loggedDate })
  const eaten = mealLogs.data ?? EMPTY_EATEN_SET
  const toggleMealLog = useToggleMealLog({ clientId, date: loggedDate })
  // Per-row assignment id lookup — needed for the `meal_logs` upsert.
  const assignmentByMealId = useMemo(() => {
    const lookup = new Map<string, string>()
    for (const a of assignments ?? []) {
      for (const m of a.meal_plan.meals) {
        if (m.id) lookup.set(m.id, a.id)
      }
    }
    return lookup
  }, [assignments])
  // Re-tick once a minute so missed-meal status updates as the clock
  // crosses scheduled times.
  const [minuteTick, setMinuteTick] = useState(0)
  useEffect(() => {
    const handle = window.setInterval(() => setMinuteTick(n => n + 1), 60_000)
    return () => window.clearInterval(handle)
  }, [])

  const meals = useMemo(() => {
    if (!assignments)
      return [] as { id: string; name: string; time: string | null }[]
    const out: { id: string; name: string; time: string | null }[] = []
    for (const a of assignments) {
      for (const m of a.meal_plan.meals) {
        if (!m.id) continue
        out.push({ id: m.id, name: m.name, time: m.time ?? null })
      }
    }
    // Order: timed meals first chronologically, then untimed last.
    // `numberMealsForDay` uses the same sort, so its "meal N of day"
    // numbering matches the order we render here.
    out.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    })
    return out
  }, [assignments])

  // Map mealId → "meal N of the day" for the unnamed-meal fallback.
  // Shared with the meal logger and the missed-meal banner so the same
  // meal renders as "Meal 3" everywhere.
  const numberByMeal = useMemo(() => numberMealsForDay(meals), [meals])

  // Inline toggle: flip a meal's eaten state from the Today card itself
  // so the user doesn't have to navigate into the meal logger to check
  // off "ate breakfast." The mutation hook handles the optimistic patch
  // + rollback in one place — every subscriber re-renders without a
  // re-fetch.
  const toggleMeal = (mealId: string) => {
    const assignmentId = assignmentByMealId.get(mealId)
    if (!assignmentId) return
    toggleMealLog.mutate(
      { assignmentId, mealId, completed: !eaten.has(mealId) },
      { onError: () => showToast('Failed to update meal', 'error') }
    )
  }

  const eatenCount = meals.filter(m => eaten.has(m.id)).length
  const totalCount = meals.length

  // Per-meal status precomputed in a memo so `Date.now()` isn't called
  // during render (the lint rule flags it as impure). The `minuteTick`
  // dep keeps the result fresh as scheduled meal times pass.
  const statusByMeal = useMemo(() => {
    const MISSED_GRACE_MS = 30 * 60 * 1000
    const now = Date.now()
    const map = new Map<string, 'eaten' | 'missed' | 'upcoming'>()
    for (const m of meals) {
      if (eaten.has(m.id)) {
        map.set(m.id, 'eaten')
        continue
      }
      if (!m.time) {
        map.set(m.id, 'upcoming')
        continue
      }
      const [h, mi] = m.time.split(':').map(Number)
      if (Number.isNaN(h) || Number.isNaN(mi)) {
        map.set(m.id, 'upcoming')
        continue
      }
      const sched = new Date()
      sched.setHours(h, mi, 0, 0)
      map.set(
        m.id,
        now > sched.getTime() + MISSED_GRACE_MS ? 'missed' : 'upcoming'
      )
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- minuteTick is the freshness signal
  }, [meals, eaten, minuteTick])

  return (
    <Card onClick={onOpen} accent="amber" icon={Utensils} label="Meals">
      {loading || revalidatingEmpty ? (
        <CardSkeletonBody lines={3} />
      ) : meals.length === 0 ? (
        <CardEmpty
          icon={Utensils}
          title="No meals planned"
          description="Assign a meal plan to start tracking nutrition."
        />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900 tabular-nums">
              {eatenCount}
              <span className="text-slate-400 font-normal"> / {totalCount} eaten</span>
            </p>
            <p className="text-xs text-slate-500 shrink-0">
              {totalCount - eatenCount === 0
                ? 'All done'
                : `${totalCount - eatenCount} to go`}
            </p>
          </div>
          <ProgressBar value={eatenCount} total={totalCount} tone="amber" />
          <ul className="space-y-1.5 mt-2">
            {meals.slice(0, 5).map(m => {
              const status = statusByMeal.get(m.id) ?? 'upcoming'
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggleMeal(m.id)}
                    aria-pressed={status === 'eaten'}
                    aria-label={
                      status === 'eaten'
                        ? `Mark ${mealDisplayName(m.name, numberByMeal.get(m.id))} not eaten`
                        : `Mark ${mealDisplayName(m.name, numberByMeal.get(m.id))} eaten`
                    }
                    className="w-full flex items-center gap-2 text-xs text-left rounded-md px-1 py-1 -mx-1 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <StatusDot status={status} />
                    <span
                      className={`truncate ${
                        status === 'eaten' ? 'text-slate-400 line-through' : 'text-slate-700'
                      }`}
                    >
                      {mealDisplayName(m.name, numberByMeal.get(m.id))}
                    </span>
                    {m.time && (
                      <span className="ml-auto text-[10px] tabular-nums text-slate-400 shrink-0">
                        {m.time.slice(0, 5)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            {meals.length > 5 && (
              <li className="text-[11px] text-slate-400 italic px-1">
                + {meals.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
  )
}

function StatusDot({ status }: { status: 'eaten' | 'missed' | 'upcoming' }) {
  if (status === 'eaten') {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
        <Check size={10} />
      </span>
    )
  }
  if (status === 'missed') {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-700 shrink-0">
        <AlertTriangle size={10} />
      </span>
    )
  }
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-slate-400 shrink-0">
      <Clock size={10} />
    </span>
  )
}
