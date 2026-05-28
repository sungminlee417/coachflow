'use client'

// Shared "Last: X · Try Y" + "↑ Beat last" hint chips rendered above and
// below each set in both the per-exercise (ExerciseSetLogger) and the
// per-superset (SupersetLogger) views. Used to live as a private helper
// in ExerciseSetLogger; SupersetLogger had a duplicated copy inlined,
// which drifted over time. Pulling them out collapses ~80 LOC and gives
// us one place to evolve the look.
//
// IMPORTANT: keep these as standalone module-level components — not
// nested inside the loggers — so React treats them as a stable type
// across renders. Re-declaring a component in a parent's body would
// remount the inputs on every keystroke and steal focus mid-edit.

import { ArrowDown, ArrowUp, ChevronUp } from 'lucide-react'
import {
  formatPriorHint,
  getRepRangeFeedback,
  isImprovement,
  type PriorPerformance,
} from '@/lib/training'

// The narrowest row shape both loggers can satisfy. The set logger's
// `RowState` extends this with extra machine fields; the superset's
// version has an `exerciseId` we don't need here. Either passes.
export interface HintRow {
  set_number: number
  target_reps: string
  reps_performed: string
  weight_performed: string
  duration_input: string
  duration_performed_seconds: number | null
  completed: boolean
}

// Strength-only pre-set load suggestion. `prev` is the most recent
// completed performance for the same set; the rep-range feedback turns
// "you crushed the target" into "+5 lb" (or "−5 lb" the other way).
function deriveSuggestion(
  row: HintRow,
  prev: PriorPerformance,
  isCardio: boolean
): { direction: 'up' | 'down'; weight: number } | null {
  if (isCardio || prev.weight_performed == null) return null
  const fb = getRepRangeFeedback(
    row.target_reps,
    prev.reps_performed,
    prev.weight_performed
  )
  if (!fb || fb.state === 'on-target') return null
  const weight = prev.weight_performed + fb.delta
  if (weight <= 0) return null
  return { direction: fb.delta > 0 ? 'up' : 'down', weight }
}

export function PreSetHint({
  row,
  prior,
  loaded,
  isCardio,
  className,
}: {
  row: HintRow
  prior: PriorPerformance | undefined
  loaded: boolean
  isCardio: boolean
  /** Override the default padding/margins — superset rows are denser
   *  than solo rows and need a tighter layout. */
  className?: string
}) {
  const prev = loaded ? prior : undefined
  if (!prev) return null
  const last = formatPriorHint(prev, isCardio)
  const suggestion = deriveSuggestion(row, prev, isCardio)
  if (!last && !suggestion) return null
  return (
    <div
      className={
        className ??
        'flex items-center gap-2 text-[10px] px-3 pt-2 flex-wrap'
      }
    >
      {last && (
        <span className="text-subtle tabular-nums">
          Last: <span className="font-medium text-muted">{last}</span>
        </span>
      )}
      {suggestion && (
        <span
          className={`inline-flex items-center gap-1 font-medium border rounded-full px-2 py-0.5 tabular-nums ${
            suggestion.direction === 'up'
              ? 'text-indigo-fg bg-indigo-soft border-indigo-line'
              : 'text-amber-fg bg-amber-soft border-amber-line'
          }`}
        >
          {suggestion.direction === 'up' ? (
            <ArrowUp size={11} />
          ) : (
            <ArrowDown size={11} />
          )}
          Try {suggestion.weight}
        </span>
      )}
    </div>
  )
}

export function PostSetHint({
  row,
  prior,
  loaded,
  isCardio,
  manuallyExpanded,
  onCollapse,
  className,
}: {
  row: HintRow
  prior: PriorPerformance | undefined
  loaded: boolean
  isCardio: boolean
  /** Set of set numbers the user re-expanded after auto-collapse. Drives
   *  whether the collapse-back affordance is shown. */
  manuallyExpanded: Set<number>
  onCollapse: (setNumber: number) => void
  className?: string
}) {
  const prev = loaded ? prior : undefined
  const improved = prev ? isImprovement(row, prev, isCardio) : false
  const showCollapse =
    loaded && row.completed && manuallyExpanded.has(row.set_number)
  if (!improved && !showCollapse) return null
  return (
    <div
      className={
        className ??
        'flex items-center justify-end gap-2 text-[10px] px-3 pb-1.5 flex-wrap'
      }
    >
      {improved && (
        <span className="inline-flex items-center gap-0.5 text-emerald-fg bg-emerald-soft border border-emerald-line rounded-full px-1.5 py-px font-semibold tabular-nums">
          ↑ Beat last
        </span>
      )}
      {showCollapse && (
        <button
          type="button"
          onClick={() => onCollapse(row.set_number)}
          className="inline-flex items-center gap-0.5 text-subtle hover:text-foreground cursor-pointer"
          aria-label="Collapse this set"
        >
          <ChevronUp size={11} />
          Collapse
        </button>
      )}
    </div>
  )
}
