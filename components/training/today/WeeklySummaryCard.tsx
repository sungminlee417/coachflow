'use client'

// Rolling 7-day summary tile rendered above the per-feature cards on the
// Today dashboard. Pulls a single 14-day window of set + meal logs and
// splits it into "this week" (most recent 7 days) and "last week" (the
// 7 days before that) so we can render a momentum delta in one fetch.
//
// We deliberately don't combine this with HeroStats: HeroStats is the
// per-day vital signs strip, this is the per-week story. They share the
// same query cache when the user opens the Workout History view, which
// already loads lifetime set logs — but for Today we want a small,
// bounded query so the dashboard's first paint stays cheap.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowDown, ArrowRight, ArrowUp, Flame, Minus, TrendingUp } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { shiftDateISO, todayISO } from '@/lib/utils'

interface SetLogPoint {
  logged_date: string
  reps_performed: number | null
  weight_performed: number | null
  completed: boolean
  assignment: { client_id: string } | { client_id: string }[] | null
}

interface MealLogPoint {
  logged_date: string
}

interface Bucket {
  workoutDays: number
  sets: number
  volume: number
  meals: number
}

const EMPTY_BUCKET: Bucket = { workoutDays: 0, sets: 0, volume: 0, meals: 0 }

function bucketLogs(
  setLogs: SetLogPoint[],
  mealLogs: MealLogPoint[],
  fromISO: string,
  toISO: string
): Bucket {
  const workoutDays = new Set<string>()
  let sets = 0
  let volume = 0
  for (const r of setLogs) {
    if (r.logged_date < fromISO || r.logged_date > toISO) continue
    if (!r.completed) continue
    workoutDays.add(r.logged_date)
    sets += 1
    if (r.weight_performed != null && r.reps_performed != null) {
      volume += r.weight_performed * r.reps_performed
    }
  }
  let meals = 0
  for (const m of mealLogs) {
    if (m.logged_date < fromISO || m.logged_date > toISO) continue
    meals += 1
  }
  return { workoutDays: workoutDays.size, sets, volume, meals }
}

export function WeeklySummaryCard({
  clientId,
  onOpen,
}: {
  clientId: string
  /** Tap-to-open hop into the Progress view, matching the rest of the
   *  Today dashboard's "every card is a deep link" convention. */
  onOpen?: () => void
}) {
  const supabase = useSupabase()
  const today = todayISO()
  const thisWeekStart = shiftDateISO(today, -6)
  const lastWeekStart = shiftDateISO(today, -13)
  const lastWeekEnd = shiftDateISO(today, -7)

  // 14-day window, single round trip per source. Anchored on the active
  // calendar day so the query key naturally rolls over at midnight.
  const setLogsQuery = useQuery({
    queryKey: ['today', 'weekly-summary', 'set_logs', clientId, today],
    queryFn: async (): Promise<SetLogPoint[]> => {
      const { data, error } = await supabase
        .from('set_logs')
        .select(
          'logged_date, reps_performed, weight_performed, completed, assignment:assignment_id!inner ( client_id )'
        )
        .eq('assignment.client_id', clientId)
        .gte('logged_date', lastWeekStart)
        .lte('logged_date', today)
      if (error) throw error
      return (data ?? []) as SetLogPoint[]
    },
  })

  const mealLogsQuery = useQuery({
    queryKey: ['today', 'weekly-summary', 'meal_logs', clientId, today],
    queryFn: async (): Promise<MealLogPoint[]> => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('logged_date')
        .eq('user_id', clientId)
        .gte('logged_date', lastWeekStart)
        .lte('logged_date', today)
      if (error) throw error
      return (data ?? []) as MealLogPoint[]
    },
  })

  const { thisWeek, lastWeek } = useMemo(() => {
    const setLogs = setLogsQuery.data ?? []
    const mealLogs = mealLogsQuery.data ?? []
    return {
      thisWeek: bucketLogs(setLogs, mealLogs, thisWeekStart, today),
      lastWeek: bucketLogs(setLogs, mealLogs, lastWeekStart, lastWeekEnd),
    }
  }, [setLogsQuery.data, mealLogsQuery.data, thisWeekStart, today, lastWeekStart, lastWeekEnd])

  const loading =
    (setLogsQuery.isLoading && !setLogsQuery.isSuccess) ||
    (mealLogsQuery.isLoading && !mealLogsQuery.isSuccess)

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="h-4 w-32 bg-line/70 rounded animate-pulse mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-5 w-14 bg-line/70 rounded animate-pulse" />
              <div className="h-3 w-20 bg-line/70 rounded mt-1.5 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Don't render the card at all for a brand-new account with no
  // activity in the last 14 days — it would just be a row of zeros and
  // a "no change" delta, which is noise.
  if (
    thisWeek === EMPTY_BUCKET ||
    (thisWeek.sets === 0 &&
      thisWeek.meals === 0 &&
      lastWeek.sets === 0 &&
      lastWeek.meals === 0)
  ) {
    return null
  }

  const Container: 'button' | 'div' = onOpen ? 'button' : 'div'
  return (
    <Container
      {...(onOpen
        ? {
            type: 'button' as const,
            onClick: onOpen,
            'aria-label': 'Open Progress',
          }
        : {})}
      className={`w-full text-left rounded-2xl border border-line bg-surface p-4 shadow-sm transition-shadow ${
        onOpen ? 'hover:shadow-md hover:border-indigo-line cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-indigo-fg" />
          <h3 className="text-sm font-semibold text-foreground">This week</h3>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-subtle">
          <span>vs. last 7 days</span>
          {onOpen && <ArrowRight size={12} className="text-faint" />}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatCell
          icon={<Flame size={12} />}
          tone="amber"
          headline={`${thisWeek.workoutDays}`}
          label={thisWeek.workoutDays === 1 ? 'workout day' : 'workout days'}
          deltaBase={lastWeek.workoutDays}
          deltaValue={thisWeek.workoutDays}
          unit=""
        />
        <StatCell
          icon={<Activity size={12} />}
          tone="emerald"
          headline={`${thisWeek.sets}`}
          label={thisWeek.sets === 1 ? 'set logged' : 'sets logged'}
          deltaBase={lastWeek.sets}
          deltaValue={thisWeek.sets}
          unit=""
        />
        <StatCell
          icon={<TrendingUp size={12} />}
          tone="indigo"
          headline={
            thisWeek.volume > 0
              ? Math.round(thisWeek.volume).toLocaleString()
              : '0'
          }
          label="volume lifted"
          deltaBase={lastWeek.volume}
          deltaValue={thisWeek.volume}
          unit=""
        />
      </div>
    </Container>
  )
}

function StatCell({
  icon,
  tone,
  headline,
  label,
  deltaBase,
  deltaValue,
  unit,
}: {
  icon: React.ReactNode
  tone: 'amber' | 'emerald' | 'indigo'
  headline: string
  label: string
  deltaBase: number
  deltaValue: number
  unit: string
}) {
  const toneClasses = {
    amber: 'text-amber-fg',
    emerald: 'text-emerald-fg',
    indigo: 'text-indigo-fg',
  }[tone]
  const delta = deltaValue - deltaBase
  let deltaLabel: React.ReactNode
  if (deltaBase === 0 && deltaValue === 0) {
    deltaLabel = (
      <span className="inline-flex items-center gap-0.5 text-faint">
        <Minus size={10} /> none last wk
      </span>
    )
  } else if (delta === 0) {
    deltaLabel = (
      <span className="inline-flex items-center gap-0.5 text-subtle">
        <Minus size={10} /> same
      </span>
    )
  } else if (delta > 0) {
    deltaLabel = (
      <span className="inline-flex items-center gap-0.5 text-emerald-fg">
        <ArrowUp size={10} /> {Math.round(delta).toLocaleString()}
        {unit}
      </span>
    )
  } else {
    deltaLabel = (
      <span className="inline-flex items-center gap-0.5 text-red-fg">
        <ArrowDown size={10} /> {Math.round(Math.abs(delta)).toLocaleString()}
        {unit}
      </span>
    )
  }

  return (
    <div className="min-w-0">
      <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${toneClasses}`}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground tabular-nums mt-1 truncate">
        {headline}
      </p>
      <p className="text-[10px] tabular-nums mt-0.5">{deltaLabel}</p>
    </div>
  )
}
