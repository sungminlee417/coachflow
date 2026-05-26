'use client'

// "Last month wrapped" recap that surfaces during the first week of a
// new month. Pulls a single window of completed set logs from the prior
// month and renders a four-stat summary (workout days, total sets,
// volume lifted, longest cardio). Hidden the rest of the month so the
// dashboard doesn't get crowded with stale celebratory cards.
//
// Dismissal is per-month + per-device via localStorage — once a trainee
// taps "Got it" the card stays gone until the next month rolls over.

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck2, Sparkles, X } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { formatDuration, todayISO } from '@/lib/utils'

interface SetLogPoint {
  logged_date: string
  reps_performed: number | null
  weight_performed: number | null
  duration_performed_seconds: number | null
  completed: boolean
  assignment: { client_id: string } | { client_id: string }[] | null
}

interface Recap {
  monthLabel: string
  workoutDays: number
  sets: number
  volume: number
  longestCardio: number | null
}

// First-of-this-month minus 1 day = last day of prior month. Walking
// from the first of that month gives us the [start, end] window.
function priorMonthRange(today: string): { start: string; end: string; label: string } {
  const [y, m] = today.split('-').map(Number)
  const thisFirst = new Date(y, m - 1, 1)
  const lastEnd = new Date(thisFirst.getTime() - 86400_000)
  const start = new Date(lastEnd.getFullYear(), lastEnd.getMonth(), 1)
  const fmt = (d: Date) => {
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  return {
    start: fmt(start),
    end: fmt(lastEnd),
    label: lastEnd.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  }
}

function recapStorageKey(clientId: string, monthLabel: string): string {
  // Single source of truth for the dismissal key so the toggling logic
  // can't drift between "set on dismiss" and "check on mount".
  return `monthly-recap-dismissed:${clientId}:${monthLabel}`
}

export function MonthlyRecapCard({ clientId }: { clientId: string }) {
  const supabase = useSupabase()
  const today = todayISO()
  const dayOfMonth = parseInt(today.split('-')[2] ?? '0', 10)
  const range = useMemo(() => priorMonthRange(today), [today])

  // Dismissal state mirrors localStorage so the card flicker-disappears
  // immediately on tap without waiting for the next render cycle. We
  // read the initial value lazily inside `useState` so SSR returns a
  // stable `false` and the client picks up the actual flag on hydration.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(recapStorageKey(clientId, range.label)) === '1'
    } catch {
      return false
    }
  })

  // Skip entirely outside the first 7 days of the month, OR when the
  // user already dismissed this month's recap.
  const inWindow = dayOfMonth <= 7

  const recapQuery = useQuery({
    queryKey: ['today', 'monthly_recap', clientId, range.start, range.end],
    enabled: inWindow && !dismissed,
    queryFn: async (): Promise<Recap> => {
      const { data, error } = await supabase
        .from('set_logs')
        .select(
          'logged_date, reps_performed, weight_performed, duration_performed_seconds, completed, assignment:assignment_id!inner ( client_id )'
        )
        .eq('assignment.client_id', clientId)
        .gte('logged_date', range.start)
        .lte('logged_date', range.end)
      if (error) throw error
      const rows = (data ?? []) as SetLogPoint[]
      const workoutDays = new Set<string>()
      let sets = 0
      let volume = 0
      let longestCardio: number | null = null
      for (const r of rows) {
        if (!r.completed) continue
        workoutDays.add(r.logged_date)
        sets += 1
        if (r.weight_performed != null && r.reps_performed != null) {
          volume += r.weight_performed * r.reps_performed
        }
        if (
          r.duration_performed_seconds != null &&
          r.duration_performed_seconds > 0 &&
          (longestCardio == null || r.duration_performed_seconds > longestCardio)
        ) {
          longestCardio = r.duration_performed_seconds
        }
      }
      return {
        monthLabel: range.label,
        workoutDays: workoutDays.size,
        sets,
        volume,
        longestCardio,
      }
    },
  })

  if (!inWindow || dismissed) return null
  if (recapQuery.isLoading) return null
  const recap = recapQuery.data
  if (!recap || recap.sets === 0) return null

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissed(true)
    try {
      window.localStorage.setItem(recapStorageKey(clientId, recap.monthLabel), '1')
    } catch {
      // See useEffect note — failing to persist is acceptable.
    }
  }

  return (
    <div className="rounded-2xl border border-purple-line card-tint-purple p-4 relative shadow-sm">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss monthly recap"
        className="absolute top-2.5 right-2.5 h-6 w-6 rounded-md flex items-center justify-center text-purple-fg/70 hover:text-purple-fg hover:bg-surface/60 transition-colors cursor-pointer"
      >
        <X size={12} />
      </button>
      <div className="flex items-center gap-2 mb-2 pr-6">
        <div className="h-8 w-8 rounded-lg bg-purple-strong text-purple-fg flex items-center justify-center shrink-0">
          <Sparkles size={14} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-fg">
            {recap.monthLabel} recap
          </p>
          <p className="text-sm font-semibold text-foreground truncate">
            Here&rsquo;s how last month went.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        <RecapStat
          label="Workout days"
          value={`${recap.workoutDays}`}
          icon={<CalendarCheck2 size={12} />}
        />
        <RecapStat
          label="Sets logged"
          value={`${recap.sets}`}
        />
        <RecapStat
          label="Volume"
          value={
            recap.volume > 0 ? Math.round(recap.volume).toLocaleString() : '—'
          }
        />
        <RecapStat
          label="Longest cardio"
          value={recap.longestCardio != null ? formatDuration(recap.longestCardio) : '—'}
        />
      </div>
    </div>
  )
}

function RecapStat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-purple-fg font-semibold">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="text-base font-bold text-foreground tabular-nums truncate mt-0.5">
        {value}
      </p>
    </div>
  )
}
