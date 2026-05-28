'use client'

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { useAssignmentSync } from '@/lib/hooks/use-assignment-sync'

interface SubstitutionPickerProps {
  assignmentId: string
  exerciseId: string
  loggedDate: string
  /** The original prescribed name — shown as the leftmost chip / revert target. */
  originalName: string
  /** Coach-defined alternatives. */
  alternatives: string[]
  /** Currently active substitution (null = original is in play). */
  current: string | null
  /** Parent owns the active value so the title above stays in sync. */
  onChange: (next: string | null) => void
}

/**
 * Per-day swap UI. Renders the original + each alternative as compact chips;
 * tapping one upserts/deletes a row in `exercise_substitutions` for the day.
 *
 * Optimistic — the chip flips immediately; on failure we revert and toast.
 */
export function SubstitutionPicker({
  assignmentId,
  exerciseId,
  loggedDate,
  originalName,
  alternatives,
  current,
  onChange,
}: SubstitutionPickerProps) {
  const supabase = useSupabase()
  const { invalidateWorkouts } = useAssignmentSync()
  const [busy, setBusy] = useState(false)

  if (alternatives.length === 0 && !current) return null

  const apply = async (next: string | null) => {
    if (busy || next === current) return
    const previous = current
    onChange(next)
    setBusy(true)
    try {
      if (next == null) {
        const { error } = await supabase
          .from('exercise_substitutions')
          .delete()
          .eq('assignment_id', assignmentId)
          .eq('exercise_id', exerciseId)
          .eq('logged_date', loggedDate)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('exercise_substitutions')
          .upsert(
            {
              assignment_id: assignmentId,
              exercise_id: exerciseId,
              logged_date: loggedDate,
              substituted_name: next,
            },
            { onConflict: 'assignment_id,exercise_id,logged_date' }
          )
        if (error) throw error
      }
      // The Today WorkoutCard reads the substituted name off the
      // assignment query (it's folded in via `fetchActiveWorkoutAssignments`).
      // Without this invalidation, a swap made inside ClientWorkoutView
      // wouldn't reflect on Today until the next focus refetch.
      await invalidateWorkouts()
    } catch {
      onChange(previous)
      showToast('Failed to save swap', 'error')
    } finally {
      setBusy(false)
    }
  }

  // Build the chip list: original first, then alternatives. The "active" chip
  // gets the indigo treatment; clicking the original chip clears the swap.
  const chips: { label: string; value: string | null; active: boolean }[] = [
    { label: originalName, value: null, active: current == null },
    ...alternatives.map(name => ({
      label: name,
      value: name,
      active: current === name,
    })),
  ]

  return (
    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-subtle w-full sm:w-auto sm:mr-1">
        or:
      </span>
      {chips.map(chip => (
        <button
          key={chip.label}
          type="button"
          onClick={() => apply(chip.value)}
          disabled={busy}
          aria-pressed={chip.active}
          className={`text-xs sm:text-[11px] font-medium px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-full border transition-colors cursor-pointer max-w-full truncate ${
 chip.active
 ? 'bg-indigo-600 text-white border-indigo-600'
 : 'bg-surface text-foreground border-line hover:border-indigo-300 hover:text-indigo-fg active:bg-indigo-soft '
 } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {chip.label}
        </button>
      ))}
      {current && (
        <button
          type="button"
          onClick={() => apply(null)}
          disabled={busy}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted hover:text-foreground px-2 py-1 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Revert to original"
        >
          <RotateCcw size={11} />
          Revert
        </button>
      )}
    </div>
  )
}
