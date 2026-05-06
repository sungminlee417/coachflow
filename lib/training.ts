import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDuration } from './utils'
import type { Exercise, ExerciseSet } from './types'

/**
 * Resolve the prescribed sets for an exercise.
 *
 * Newer workouts populate `exercise_sets` directly. Older ones (created before
 * per-set rows existed) only have the legacy flat `sets`/`reps` columns; we
 * synthesize a uniform set list from those so the loggers can render a table
 * either way.
 */
export const buildPrescribedSets = (exercise: Exercise): ExerciseSet[] => {
  if (exercise.exercise_sets && exercise.exercise_sets.length > 0) {
    return [...exercise.exercise_sets].sort((a, b) => a.set_number - b.set_number)
  }
  const count = Math.max(1, exercise.sets ?? 1)
  return Array.from({ length: count }, (_, i) => ({
    set_number: i + 1,
    target_reps: exercise.reps ?? '',
    target_duration_seconds: null,
    notes: '',
  }))
}

// Compact representation of "what the client did last time on this set."
// Sourced from set_logs; one entry per set_number, the most recent before today.
export interface PriorPerformance {
  set_number: number
  reps_performed: number | null
  weight_performed: number | null
  duration_performed_seconds: number | null
  logged_date: string
}

const toNum = (v: string | number | null | undefined): number | null => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v === '') return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Did the client beat their previous performance on this set?
 *
 * Strength: more reps at >= weight, or more weight at >= reps. Treats a missing
 * previous weight as 0 so adding load to a previously bodyweight set counts.
 *
 * Cardio: longer duration than last time.
 *
 * Returns false until both rows are quantified (incomplete inputs don't pop
 * the badge prematurely).
 */
export function isImprovement(
  current: {
    reps_performed?: string | number | null
    weight_performed?: string | number | null
    duration_performed_seconds?: number | null
  },
  prev: PriorPerformance,
  cardio: boolean
): boolean {
  if (cardio) {
    const cur = current.duration_performed_seconds
    const prv = prev.duration_performed_seconds
    return cur != null && prv != null && cur > prv
  }
  const curR = toNum(current.reps_performed)
  if (curR == null) return false
  const prvR = prev.reps_performed
  if (prvR == null) return false
  const curW = toNum(current.weight_performed) ?? 0
  const prvW = prev.weight_performed ?? 0
  if (curR > prvR && curW >= prvW) return true
  if (curR >= prvR && curW > prvW) return true
  return false
}

/**
 * Single-line, ghost-text summary of last week's set.
 *
 * Strength: "{weight} × {reps}" (e.g., "135 × 8") — matches the column order
 * weight-then-reps so the hint reads naturally under the inputs.
 * Cardio: formatted duration (e.g., "25:30").
 */
export function formatPriorHint(prev: PriorPerformance, cardio: boolean): string | null {
  if (cardio) {
    if (prev.duration_performed_seconds == null) return null
    return formatDuration(prev.duration_performed_seconds)
  }
  if (prev.reps_performed == null) return null
  if (prev.weight_performed != null) {
    return `${prev.weight_performed} × ${prev.reps_performed}`
  }
  return String(prev.reps_performed)
}

/**
 * Fetch the most recent log per `set_number` for a given assignment+exercise
 * strictly before `beforeDate`. PostgREST doesn't have DISTINCT ON, so we pull
 * all prior rows ordered newest-first and de-dup by set_number client-side.
 *
 * When `currentVariant` is provided (the substitute name in play today, or
 * null for the original exercise), prior logs are filtered to dates where the
 * SAME variant was active — so progressive-overload comparisons aren't made
 * against a different exercise (e.g., last week's goblet squat shouldn't show
 * up as "last" when this week is back on barbell squat).
 */
export async function fetchPriorPerformance(
  supabase: SupabaseClient,
  assignmentId: string,
  exerciseId: string,
  beforeDate: string,
  currentVariant: string | null = null
): Promise<Map<number, PriorPerformance>> {
  // Substitutions for this slot on prior dates; absence = original was active.
  const subByDate = new Map<string, string>()
  try {
    const { data: subs } = await supabase
      .from('exercise_substitutions')
      .select('logged_date, substituted_name')
      .eq('assignment_id', assignmentId)
      .eq('exercise_id', exerciseId)
      .lt('logged_date', beforeDate)
    for (const s of (subs ?? []) as { logged_date: string; substituted_name: string }[]) {
      subByDate.set(s.logged_date, s.substituted_name)
    }
  } catch {
    // If the substitutions table doesn't exist yet (migration not run) or
    // RLS blocks it, treat every prior date as the original variant.
  }

  const { data } = await supabase
    .from('set_logs')
    .select('set_number, reps_performed, weight_performed, duration_performed_seconds, logged_date')
    .eq('assignment_id', assignmentId)
    .eq('exercise_id', exerciseId)
    .lt('logged_date', beforeDate)
    .order('logged_date', { ascending: false })

  const map = new Map<number, PriorPerformance>()
  for (const row of (data ?? []) as PriorPerformance[]) {
    if (map.has(row.set_number)) continue
    const variant = subByDate.get(row.logged_date) ?? null
    if (variant === currentVariant) {
      map.set(row.set_number, row)
    }
  }
  return map
}
