'use client'

// Reminder banner that surfaces a workout the trainee started but didn't
// finish on a previous day (last 3 days, excluding today). Hopefully
// gentle enough to nudge without nagging — disappears entirely if there's
// nothing unfinished and shows at most one entry (the most recent gap).
//
// The data shape mirrors the live Today workout query so we can reuse
// the same trainee-RPC path and benefit from the existing cache. We only
// peek at the most recent 3 days; deeper backlog would feel less like a
// recovery prompt and more like guilt-tripping.

import { useQuery } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { shiftDateISO, todayISO } from '@/lib/utils'
import type { TodayNavTarget } from './primitives'

interface AssignmentSlim {
  id: string
  date: string
  name: string
  prescribed: number
  completed: number
}

interface RpcAssignment {
  id: string
  workout: {
    name: string
    exercises: Array<{
      id: string
      exercise_sets: Array<{ id: string }> | null
      sets?: number | null
    }>
  }
}

interface SetLogPoint {
  assignment_id: string
  exercise_id: string
  set_number: number
  logged_date: string
  completed: boolean
}

export function UnfinishedWorkoutBanner({
  clientId,
  onResume,
}: {
  clientId: string
  onResume: (target: TodayNavTarget) => void
}) {
  const supabase = useSupabase()
  const today = todayISO()
  const yesterday = shiftDateISO(today, -1)

  const unfinishedQuery = useQuery({
    queryKey: ['today', 'unfinished_workouts', clientId, today],
    queryFn: async (): Promise<AssignmentSlim | null> => {
      // Walk back day-by-day starting at yesterday so the banner always
      // reflects the most recent gap. Stop on the first day with an
      // incomplete-but-started workout — older incompletes are buried.
      for (let offset = 1; offset <= 3; offset += 1) {
        const date = shiftDateISO(today, -offset)
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_active_workout_assignments',
          { p_client_id: clientId, p_date: date }
        )
        if (rpcError) continue
        const assignments = (rpcData ?? []) as RpcAssignment[]
        if (assignments.length === 0) continue

        const ids = assignments.map(a => a.id)
        const { data: logsData, error: logsError } = await supabase
          .from('set_logs')
          .select('assignment_id, exercise_id, set_number, logged_date, completed')
          .in('assignment_id', ids)
          .eq('logged_date', date)
        if (logsError) continue
        const logs = (logsData ?? []) as SetLogPoint[]

        for (const a of assignments) {
          let prescribed = 0
          for (const ex of a.workout.exercises ?? []) {
            prescribed += ex.exercise_sets?.length ?? ex.sets ?? 0
          }
          if (prescribed === 0) continue
          let done = 0
          for (const log of logs) {
            if (log.assignment_id === a.id && log.completed) done += 1
          }
          // "Started but not finished": at least one completed set, but
          // not every prescribed set.
          if (done > 0 && done < prescribed) {
            return {
              id: a.id,
              date,
              name: a.workout.name,
              prescribed,
              completed: done,
            }
          }
        }
      }
      return null
    },
  })

  const data = unfinishedQuery.data
  if (!data) return null

  const dayLabel = data.date === yesterday ? 'yesterday' : windowLabel(data.date)
  const remaining = data.prescribed - data.completed

  return (
    <button
      type="button"
      onClick={() => onResume('assigned-workouts')}
      className="w-full text-left rounded-2xl border border-amber-line card-tint-amber p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-amber-strong text-amber-fg flex items-center justify-center shrink-0">
          <CircleAlert size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-fg">
            Unfinished
          </p>
          <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
            {data.name}
          </p>
          <p className="text-xs text-muted mt-0.5 tabular-nums">
            {data.completed}/{data.prescribed} sets done {dayLabel} — {remaining}{' '}
            {remaining === 1 ? 'set' : 'sets'} left. Tap to pick up.
          </p>
        </div>
      </div>
    </button>
  )

  function windowLabel(dateISO: string): string {
    const offset = daysAgo(dateISO)
    if (offset === 1) return 'yesterday'
    return `${offset} days ago`
  }
}

function daysAgo(dateISO: string): number {
  const today = todayISO()
  const [ay, am, ad] = dateISO.split('-').map(Number)
  const [by, bm, bd] = today.split('-').map(Number)
  const a = Date.UTC(ay, am - 1, ad)
  const b = Date.UTC(by, bm - 1, bd)
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}
