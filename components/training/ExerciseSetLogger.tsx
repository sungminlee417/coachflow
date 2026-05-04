'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Check } from 'lucide-react'
import type { Exercise, ExerciseSet, SetLog } from '@/lib/types'

interface ExerciseSetLoggerProps {
  assignmentId: string
  exercise: Exercise
}

interface RowState {
  set_number: number
  target_reps: string
  reps_performed: string
  weight_performed: string
  completed: boolean
  // Track save status per row for subtle feedback.
  saving?: boolean
}

// If the exercise has no per-set rows, fall back to its legacy `sets`/`reps`.
const buildPrescribedSets = (exercise: Exercise): ExerciseSet[] => {
  if (exercise.exercise_sets && exercise.exercise_sets.length > 0) {
    return [...exercise.exercise_sets].sort((a, b) => a.set_number - b.set_number)
  }
  const count = Math.max(1, exercise.sets ?? 1)
  return Array.from({ length: count }, (_, i) => ({
    set_number: i + 1,
    target_reps: exercise.reps ?? '',
    notes: '',
  }))
}

export function ExerciseSetLogger({ assignmentId, exercise }: ExerciseSetLoggerProps) {
  const supabase = useSupabase()
  const [rows, setRows] = useState<RowState[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const prescribed = buildPrescribedSets(exercise)
      // Fetch any existing set_logs for this assignment + exercise.
      const { data: logs } = await supabase
        .from('set_logs')
        .select('set_number, reps_performed, weight_performed, completed')
        .eq('assignment_id', assignmentId)
        .eq('exercise_id', exercise.id ?? '')

      if (cancelled) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logBySet = new Map<number, any>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (logs ?? []).map((l: any) => [l.set_number, l])
      )

      const merged: RowState[] = prescribed.map(p => {
        const log = logBySet.get(p.set_number)
        return {
          set_number: p.set_number,
          target_reps: p.target_reps ?? '',
          reps_performed: log?.reps_performed != null ? String(log.reps_performed) : '',
          weight_performed: log?.weight_performed != null ? String(log.weight_performed) : '',
          completed: !!log?.completed,
        }
      })
      setRows(merged)
    }
    load()
    return () => {
      cancelled = true
    }
    // Re-fetch only when assignment/exercise identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, exercise.id])

  const updateRow = (setNumber: number, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => (r.set_number === setNumber ? { ...r, ...patch } : r)))
  }

  // Persist the current state of a single row by upserting into set_logs.
  const persist = async (row: RowState) => {
    if (!exercise.id) return
    updateRow(row.set_number, { saving: true })
    try {
      const reps = row.reps_performed === '' ? null : parseFloat(row.reps_performed)
      const weight = row.weight_performed === '' ? null : parseFloat(row.weight_performed)
      const { error } = await supabase
        .from('set_logs')
        .upsert(
          {
            assignment_id: assignmentId,
            exercise_id: exercise.id,
            set_number: row.set_number,
            reps_performed: Number.isNaN(reps as number) ? null : reps,
            weight_performed: Number.isNaN(weight as number) ? null : weight,
            completed: row.completed,
          },
          { onConflict: 'assignment_id,exercise_id,set_number' }
        )
      if (error) throw error
    } catch {
      showToast('Failed to save set', 'error')
    } finally {
      updateRow(row.set_number, { saving: false })
    }
  }

  // Toggle completion immediately (no blur required).
  const toggleComplete = async (setNumber: number) => {
    const row = rows.find(r => r.set_number === setNumber)
    if (!row) return
    const next = { ...row, completed: !row.completed }
    updateRow(setNumber, { completed: next.completed })
    await persist(next)
  }

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 italic mt-2">No sets prescribed.</p>
  }

  return (
    <div className="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="col-span-1 text-center">Set</div>
        <div className="col-span-2">Target</div>
        <div className="col-span-4">Reps</div>
        <div className="col-span-4">Weight</div>
        <div className="col-span-1 text-center">Done</div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map(row => {
          return (
            <div
              key={row.set_number}
              className={`grid grid-cols-12 gap-2 items-center px-3 py-2 transition-colors ${
                row.completed ? 'bg-emerald-50/40' : ''
              }`}
            >
              <div className="col-span-1 text-center text-sm font-semibold text-slate-700 tabular-nums">
                {row.set_number}
              </div>
              <div className="col-span-2 text-xs text-slate-500 truncate">
                {row.target_reps || <span className="italic text-slate-400">—</span>}
              </div>
              <div className="col-span-4">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={row.reps_performed}
                  onChange={e => updateRow(row.set_number, { reps_performed: e.target.value })}
                  onBlur={() => persist(rows.find(r => r.set_number === row.set_number)!)}
                  placeholder="reps"
                  className="text-sm py-1.5"
                />
              </div>
              <div className="col-span-4">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={row.weight_performed}
                  onChange={e => updateRow(row.set_number, { weight_performed: e.target.value })}
                  onBlur={() => persist(rows.find(r => r.set_number === row.set_number)!)}
                  placeholder="weight"
                  className="text-sm py-1.5"
                />
              </div>
              <div className="col-span-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => toggleComplete(row.set_number)}
                  aria-label={row.completed ? 'Mark set incomplete' : 'Mark set complete'}
                  aria-pressed={row.completed}
                  className={`h-6 w-6 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                    row.completed
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 text-transparent hover:border-slate-400'
                  }`}
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
