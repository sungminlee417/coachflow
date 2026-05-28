'use client'

// `set_logs` hooks.
//
// Three read shapes that real consumers need:
//   1. Per-exercise rows (`useExerciseSetLogs`) — the deep
//      ExerciseSetLogger / SupersetLogger populate inputs from these.
//   2. Day-wide summary (`useDaySetLogs`) — Today's WorkoutCard derives
//      its "X/Y sets done" progress bar from this.
//   3. Lifetime + streak — server-side aggregates that stay as their
//      own queries; mutations invalidate them so they re-run when the
//      user logs.
//
// The save mutation patches BOTH per-exercise and day-summary caches
// optimistically, then invalidates the lifetime/streak queries on
// success so derived data stays in sync without a manual refetch.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'

export interface SetLogRow {
  set_number: number
  reps_performed: number | null
  weight_performed: number | null
  duration_performed_seconds: number | null
  speed_performed: number | null
  incline_performed: number | null
  resistance_performed: number | null
  completed: boolean
}

export interface DaySetLogRow extends SetLogRow {
  assignment_id: string
  exercise_id: string
}

const FULL_SELECT =
  'set_number, reps_performed, weight_performed, duration_performed_seconds, speed_performed, incline_performed, resistance_performed, completed'

/** Per-(assignment, exercise, date) rows keyed by set_number. */
export function useExerciseSetLogs(
  assignmentId: string,
  exerciseId: string,
  date: string,
  options?: { enabled?: boolean }
) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.setLogs.forExercise(assignmentId, exerciseId, date),
    enabled: options?.enabled ?? true,
    queryFn: async (): Promise<Map<number, SetLogRow>> => {
      const { data, error } = await supabase
        .from('set_logs')
        .select(FULL_SELECT)
        .eq('assignment_id', assignmentId)
        .eq('exercise_id', exerciseId)
        .eq('logged_date', date)
      if (error) throw error
      const out = new Map<number, SetLogRow>()
      for (const r of (data ?? []) as SetLogRow[]) out.set(r.set_number, r)
      return out
    },
  })
}

interface UseSupersetSetLogsArgs {
  assignmentId: string
  exerciseIds: string[]
  date: string
}

/**
 * Combined read for a superset — one round trip for all exercises in
 * the round. Also stamps each `forExercise` cache so a deep
 * ExerciseSetLogger opened separately sees the same data without an
 * extra fetch.
 */
export function useSupersetSetLogs({
  assignmentId,
  exerciseIds,
  date,
}: UseSupersetSetLogsArgs) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const sortedIds = [...exerciseIds].sort()
  return useQuery({
    queryKey: ['set_logs', 'superset', assignmentId, sortedIds.join(','), date] as const,
    enabled: exerciseIds.length > 0,
    queryFn: async (): Promise<Map<string, Map<number, SetLogRow>>> => {
      const { data, error } = await supabase
        .from('set_logs')
        .select(`exercise_id, ${FULL_SELECT}`)
        .eq('assignment_id', assignmentId)
        .in('exercise_id', exerciseIds)
        .eq('logged_date', date)
      if (error) throw error
      const out = new Map<string, Map<number, SetLogRow>>()
      for (const id of exerciseIds) out.set(id, new Map())
      for (const r of (data ?? []) as Array<SetLogRow & { exercise_id: string }>) {
        const { exercise_id, ...row } = r
        const inner = out.get(exercise_id)
        if (inner) inner.set(row.set_number, row)
      }
      // Stamp the per-exercise caches so a deep ExerciseSetLogger
      // opened on top reuses this data instead of refetching.
      for (const [exId, byNumber] of out) {
        qc.setQueryData(
          queryKeys.setLogs.forExercise(assignmentId, exId, date),
          byNumber
        )
      }
      return out
    },
  })
}

interface UseDaySetLogsArgs {
  clientId: string
  date: string
  assignmentIds: string[]
}

/**
 * Day-wide read for the Today dashboard. Returns rows indexed by
 * `${assignment_id}::${exercise_id}::${set_number}`. Includes machine
 * columns as nulls — the deep logger refetches and overwrites those.
 */
export function useDaySetLogs({ clientId, date, assignmentIds }: UseDaySetLogsArgs) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.setLogs.daySummary(clientId, date),
    enabled: assignmentIds.length > 0,
    queryFn: async (): Promise<Map<string, DaySetLogRow>> => {
      const { data, error } = await supabase
        .from('set_logs')
        .select(`assignment_id, exercise_id, ${FULL_SELECT}`)
        .in('assignment_id', assignmentIds)
        .eq('logged_date', date)
      if (error) throw error
      const out = new Map<string, DaySetLogRow>()
      for (const r of (data ?? []) as DaySetLogRow[]) {
        out.set(`${r.assignment_id}::${r.exercise_id}::${r.set_number}`, r)
      }
      return out
    },
  })
}

interface SaveSetArgs {
  assignmentId: string
  exerciseId: string
  date: string
  /** Used to invalidate the day-summary key the same WorkoutCard reads. */
  clientId: string
  row: SetLogRow
}

export function useSaveSetLog() {
  const supabase = useSupabase()
  const qc = useQueryClient()
  return useMutation({
    // Per-(scope, set_number) mutationKey so the persister dedupes
    // identical interrupted writes on rehydrate.
    mutationKey: ['set_logs.save'],
    mutationFn: async ({ assignmentId, exerciseId, date, row }: SaveSetArgs) => {
      const { error } = await supabase
        .from('set_logs')
        .upsert(
          {
            assignment_id: assignmentId,
            exercise_id: exerciseId,
            logged_date: date,
            ...row,
          },
          { onConflict: 'assignment_id,exercise_id,set_number,logged_date' }
        )
      if (error) throw error
    },
    onMutate: async ({ assignmentId, exerciseId, date, clientId, row }) => {
      const exerciseKey = queryKeys.setLogs.forExercise(
        assignmentId,
        exerciseId,
        date
      )
      const dayKey = queryKeys.setLogs.daySummary(clientId, date)
      await qc.cancelQueries({ queryKey: exerciseKey })
      await qc.cancelQueries({ queryKey: dayKey })
      const prevExercise = qc.getQueryData<Map<number, SetLogRow>>(exerciseKey)
      const prevDay = qc.getQueryData<Map<string, DaySetLogRow>>(dayKey)
      qc.setQueryData<Map<number, SetLogRow>>(exerciseKey, current => {
        const next = new Map(current ?? [])
        next.set(row.set_number, row)
        return next
      })
      qc.setQueryData<Map<string, DaySetLogRow>>(dayKey, current => {
        const next = new Map(current ?? [])
        next.set(`${assignmentId}::${exerciseId}::${row.set_number}`, {
          ...row,
          assignment_id: assignmentId,
          exercise_id: exerciseId,
        })
        return next
      })
      return { prevExercise, prevDay, exerciseKey, dayKey }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return
      if (ctx.prevExercise) qc.setQueryData(ctx.exerciseKey, ctx.prevExercise)
      if (ctx.prevDay) qc.setQueryData(ctx.dayKey, ctx.prevDay)
    },
    onSuccess: (_data, vars) => {
      // Lifetime aggregates (PR cards, streak) depend on set_logs too —
      // invalidate so they refetch on next mount or focus.
      qc.invalidateQueries({ queryKey: queryKeys.setLogs.lifetime(vars.clientId) })
      qc.invalidateQueries({ queryKey: queryKeys.setLogs.streak(vars.clientId) })
      // Today dashboard queries (unfinished-workout banner, weekly
      // summary, monthly recap) all share the `['today', ...]` prefix.
      // Without this prefix invalidation, the banner happily kept
      // claiming a workout was unfinished even after the trainee
      // filled in the missing sets — the day-summary cache patches
      // optimistically but the banner's query key didn't overlap.
      qc.invalidateQueries({ queryKey: ['today'] })
    },
  })
}
