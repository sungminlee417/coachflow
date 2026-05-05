'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Check } from 'lucide-react'
import { formatDuration, parseDuration } from '@/lib/utils'
import { buildPrescribedSets } from '@/lib/training'
import type { Exercise } from '@/lib/types'

interface ExerciseSetLoggerProps {
  assignmentId: string
  exercise: Exercise
}

interface RowState {
  set_number: number
  target_reps: string
  target_duration_seconds: number | null
  reps_performed: string
  weight_performed: string
  // Free-text input for cardio time; parsed to seconds on blur.
  duration_input: string
  duration_performed_seconds: number | null
  completed: boolean
  saving?: boolean
}

// Render-ready rows derived purely from prescriptions. Used for the synchronous
// first paint so the logger never flashes "No sets prescribed." or jumps in size.
const buildInitialRows = (exercise: Exercise): RowState[] =>
  buildPrescribedSets(exercise).map(p => ({
    set_number: p.set_number,
    target_reps: p.target_reps ?? '',
    target_duration_seconds: p.target_duration_seconds ?? null,
    reps_performed: '',
    weight_performed: '',
    duration_input: '',
    duration_performed_seconds: null,
    completed: false,
  }))

export function ExerciseSetLogger({ assignmentId, exercise }: ExerciseSetLoggerProps) {
  const supabase = useSupabase()
  // Lazy init from props so the table renders fully on the first paint —
  // logs are merged in below without changing the row count or layout.
  const [rows, setRows] = useState<RowState[]>(() => buildInitialRows(exercise))
  // Until the log fetch resolves, render input/button slots as skeletons so
  // empty controls don't briefly appear before previously-saved values arrive.
  const [loaded, setLoaded] = useState(false)
  const isCardio = exercise.exercise_type === 'cardio'

  useEffect(() => {
    let cancelled = false
    setRows(buildInitialRows(exercise))
    setLoaded(false)

    const load = async () => {
      const { data: logs } = await supabase
        .from('set_logs')
        .select('set_number, reps_performed, weight_performed, duration_performed_seconds, completed')
        .eq('assignment_id', assignmentId)
        .eq('exercise_id', exercise.id ?? '')

      if (cancelled) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logBySet = new Map<number, any>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (logs ?? []).map((l: any) => [l.set_number, l])
      )

      setRows(prev =>
        prev.map(r => {
          const log = logBySet.get(r.set_number)
          if (!log) return r
          const performedSeconds = log.duration_performed_seconds ?? null
          return {
            ...r,
            reps_performed: log.reps_performed != null ? String(log.reps_performed) : '',
            weight_performed: log.weight_performed != null ? String(log.weight_performed) : '',
            duration_input: performedSeconds != null ? formatDuration(performedSeconds) : '',
            duration_performed_seconds: performedSeconds,
            completed: !!log.completed,
          }
        })
      )
      setLoaded(true)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, exercise.id])

  const updateRow = (setNumber: number, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => (r.set_number === setNumber ? { ...r, ...patch } : r)))
  }

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
            duration_performed_seconds: row.duration_performed_seconds,
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

  const commitDuration = (setNumber: number) => {
    const row = rows.find(r => r.set_number === setNumber)
    if (!row) return
    const parsed = parseDuration(row.duration_input)
    const next: RowState = {
      ...row,
      duration_performed_seconds: parsed,
      // Re-format on blur so the input snaps to a canonical form.
      duration_input: parsed != null ? formatDuration(parsed) : row.duration_input,
    }
    updateRow(setNumber, {
      duration_performed_seconds: next.duration_performed_seconds,
      duration_input: next.duration_input,
    })
    persist(next)
  }

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

  // Cardio layout: simpler row with a single Time field.
  if (isCardio) {
    return (
      <div className="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
          <div className="col-span-1 text-center">{rows.length > 1 ? '#' : ''}</div>
          <div className="col-span-4">Target</div>
          <div className="col-span-6">Time</div>
          <div className="col-span-1 text-center">Done</div>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map(row => (
            <div
              key={row.set_number}
              className={`grid grid-cols-12 gap-2 items-center px-3 py-2 transition-colors ${
                row.completed ? 'bg-emerald-50/40' : ''
              }`}
            >
              <div className="col-span-1 text-center text-sm font-semibold text-slate-700 tabular-nums">
                {rows.length > 1 ? row.set_number : ''}
              </div>
              <div className="col-span-4 text-xs text-slate-600 truncate">
                {row.target_duration_seconds != null && row.target_duration_seconds > 0 ? (
                  <span className="font-medium tabular-nums">
                    {formatDuration(row.target_duration_seconds)}
                  </span>
                ) : (
                  <span className="italic text-slate-400">—</span>
                )}
              </div>
              <div className="col-span-6">
                {loaded ? (
                  <Input
                    value={row.duration_input}
                    onChange={e => updateRow(row.set_number, { duration_input: e.target.value })}
                    onBlur={() => commitDuration(row.set_number)}
                    placeholder="20:30 or 30"
                    className="text-sm py-1.5"
                  />
                ) : (
                  <div className="h-8.5 w-full bg-slate-200/70 rounded-lg animate-pulse" />
                )}
              </div>
              <div className="col-span-1 flex justify-center">
                {loaded ? (
                  <button
                    type="button"
                    onClick={() => toggleComplete(row.set_number)}
                    aria-label={row.completed ? 'Mark incomplete' : 'Mark complete'}
                    aria-pressed={row.completed}
                    className={`h-6 w-6 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                      row.completed
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-300 text-transparent hover:border-slate-400'
                    }`}
                  >
                    <Check size={14} />
                  </button>
                ) : (
                  <div className="h-6 w-6 bg-slate-200/70 rounded-md animate-pulse" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
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
                {loaded ? (
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
                ) : (
                  <div className="h-8.5 w-full bg-slate-200/70 rounded-lg animate-pulse" />
                )}
              </div>
              <div className="col-span-4">
                {loaded ? (
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
                ) : (
                  <div className="h-8.5 w-full bg-slate-200/70 rounded-lg animate-pulse" />
                )}
              </div>
              <div className="col-span-1 flex justify-center">
                {loaded ? (
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
                ) : (
                  <div className="h-6 w-6 bg-slate-200/70 rounded-md animate-pulse" />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
