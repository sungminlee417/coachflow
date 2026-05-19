'use client'

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'

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
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 w-full sm:w-auto sm:mr-1">
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
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-300 active:bg-indigo-50 dark:active:bg-indigo-950/30'
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
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 px-2 py-1 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Revert to original"
        >
          <RotateCcw size={11} />
          Revert
        </button>
      )}
    </div>
  )
}
