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

/**
 * Parse a target_reps string into a numeric range so the logger can tell
 * whether the trainee hit it. Supports:
 *   "8"      → { min: 8, max: 8 }    (exact)
 *   "8-10"   → { min: 8, max: 10 }   (range)
 *   "8+"     → { min: 8, max: ∞ }    (at least)
 *   "AMRAP"  → null                  (no quantitative target)
 *   ""       → null
 *   garbage  → null
 */
export function parseRepRange(target: string): { min: number; max: number } | null {
  const trimmed = target.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.includes('amrap') || trimmed.includes('max')) return null

  const plus = trimmed.match(/^(\d+(?:\.\d+)?)\s*\+$/)
  if (plus) {
    const n = parseFloat(plus[1])
    return Number.isFinite(n) ? { min: n, max: Infinity } : null
  }

  const range = trimmed.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/)
  if (range) {
    const a = parseFloat(range[1])
    const b = parseFloat(range[2])
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { min: Math.min(a, b), max: Math.max(a, b) }
    }
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed)
    return Number.isFinite(n) ? { min: n, max: n } : null
  }
  return null
}

/**
 * Suggested weight delta in the trainee's current load unit. Tuned for
 * common gym jumps: micro-loaded accessories get 2.5, mid-range lifts
 * get 5, heavy compound lifts get 10. Bias toward "smaller delta when
 * uncertain" — overshoot is harder to recover from than undershoot.
 */
export function suggestedDelta(weight: number | null | undefined): number {
  if (weight == null || !Number.isFinite(weight) || weight <= 0) return 5
  if (weight < 50) return 2.5
  if (weight < 200) return 5
  return 10
}

export type RepRangeState = 'undershot' | 'on-target' | 'exceeded'

export interface RepRangeFeedback {
  state: RepRangeState
  /** Suggested change in load. Positive = add weight, negative = drop. */
  delta: number
  /** Lower bound of the parsed target, for display. */
  min: number
  /** Upper bound (Infinity for "8+" style prescriptions). */
  max: number
}

/**
 * Comparison of a logged set against its prescription. Returns null when
 * there's no quantitative target (AMRAP, blank) or no reps were entered
 * yet — the logger uses that to skip rendering the hint.
 */
export function getRepRangeFeedback(
  target: string | null | undefined,
  repsPerformed: number | string | null | undefined,
  weightPerformed: number | string | null | undefined
): RepRangeFeedback | null {
  if (target == null) return null
  const range = parseRepRange(target)
  if (!range) return null
  const reps =
    typeof repsPerformed === 'number'
      ? repsPerformed
      : repsPerformed === '' || repsPerformed == null
        ? NaN
        : parseFloat(repsPerformed)
  if (!Number.isFinite(reps) || reps <= 0) return null
  const weight =
    typeof weightPerformed === 'number'
      ? weightPerformed
      : weightPerformed === '' || weightPerformed == null
        ? null
        : parseFloat(weightPerformed)
  const safeWeight = weight != null && Number.isFinite(weight) ? weight : null
  const delta = suggestedDelta(safeWeight)
  // Range prescriptions ("8-10") graduate at the *top* of the range — the
  // conventional progressive-overload rule is "hit the max cleanly → add
  // weight next time". Single-value prescriptions ("8") and open-ended
  // ones ("8+") still require strictly exceeding to suggest going up.
  const isClosedRange =
    range.min < range.max && Number.isFinite(range.max)
  let state: RepRangeState
  if (reps < range.min) state = 'undershot'
  else if (isClosedRange ? reps >= range.max : reps > range.max) state = 'exceeded'
  else state = 'on-target'
  return {
    state,
    delta: state === 'undershot' ? -delta : state === 'exceeded' ? delta : 0,
    min: range.min,
    max: range.max,
  }
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
