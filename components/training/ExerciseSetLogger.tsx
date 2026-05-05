'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Check } from 'lucide-react'
import { formatDuration, parseDuration } from '@/lib/utils'
import {
  buildPrescribedSets,
  fetchPriorPerformance,
  formatPriorHint,
  isImprovement,
  type PriorPerformance,
} from '@/lib/training'
import type { Exercise } from '@/lib/types'

interface ExerciseSetLoggerProps {
  assignmentId: string
  exercise: Exercise
  /** Date the user is logging against — drives both the upsert and the
   * "previous performance" lookup. */
  loggedDate: string
}

interface RowState {
  set_number: number
  target_reps: string
  target_duration_seconds: number | null
  reps_performed: string
  weight_performed: string
  duration_input: string
  duration_performed_seconds: number | null
  completed: boolean
  saving?: boolean
}

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

export function ExerciseSetLogger({
  assignmentId,
  exercise,
  loggedDate,
}: ExerciseSetLoggerProps) {
  const supabase = useSupabase()
  const [rows, setRows] = useState<RowState[]>(() => buildInitialRows(exercise))
  const [loaded, setLoaded] = useState(false)
  const [priorBySet, setPriorBySet] = useState<Map<number, PriorPerformance>>(new Map())
  const isCardio = exercise.exercise_type === 'cardio'

  useEffect(() => {
    let cancelled = false
    setRows(buildInitialRows(exercise))
    setLoaded(false)
    setPriorBySet(new Map())

    const load = async () => {
      // Today's logs (the values to populate the inputs) and prior performance
      // (the ghost hint) can fly in parallel — they don't depend on each other.
      const [todayResult, prior] = await Promise.all([
        supabase
          .from('set_logs')
          .select('set_number, reps_performed, weight_performed, duration_performed_seconds, completed')
          .eq('assignment_id', assignmentId)
          .eq('exercise_id', exercise.id ?? '')
          .eq('logged_date', loggedDate),
        exercise.id
          ? fetchPriorPerformance(supabase, assignmentId, exercise.id, loggedDate)
          : Promise.resolve(new Map<number, PriorPerformance>()),
      ])

      if (cancelled) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logBySet = new Map<number, any>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (todayResult.data ?? []).map((l: any) => [l.set_number, l])
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
      setPriorBySet(prior)
      setLoaded(true)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, exercise.id, loggedDate])

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
            logged_date: loggedDate,
            reps_performed: Number.isNaN(reps as number) ? null : reps,
            weight_performed: Number.isNaN(weight as number) ? null : weight,
            duration_performed_seconds: row.duration_performed_seconds,
            completed: row.completed,
          },
          { onConflict: 'assignment_id,exercise_id,set_number,logged_date' }
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

  // Inline component rendering the ghost "Last week" hint and an "improved"
  // pill once the user beats their previous values for that set.
  const PriorHint = ({ row }: { row: RowState }) => {
    if (!loaded) return null
    const prev = priorBySet.get(row.set_number)
    if (!prev) return null
    const hint = formatPriorHint(prev, isCardio)
    if (!hint) return null
    const improved = isImprovement(row, prev, isCardio)
    return (
      <div className="flex items-center justify-between gap-2 text-[10px] px-3 pb-1.5">
        <span className="text-slate-400 tabular-nums">
          Last: <span className="font-medium text-slate-500">{hint}</span>
        </span>
        {improved && (
          <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px font-semibold tabular-nums">
            ↑ Beat last
          </span>
        )}
      </div>
    )
  }

  // Renders the toggle in the same h-6 footprint whether loaded or skeleton.
  const renderDone = (row: RowState) =>
    loaded ? (
      <button
        type="button"
        onClick={() => toggleComplete(row.set_number)}
        aria-label={row.completed ? 'Mark set incomplete' : 'Mark set complete'}
        aria-pressed={row.completed}
        className={`h-6 w-6 rounded-md border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
          row.completed
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-slate-300 text-transparent hover:border-slate-400'
        }`}
      >
        <Check size={14} />
      </button>
    ) : (
      <div className="h-6 w-6 bg-slate-200/70 rounded-md animate-pulse shrink-0" />
    )

  if (isCardio) {
    return (
      <div className="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* Desktop column header — hidden on phones since the row already labels itself. */}
        <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
          <div className="col-span-1 text-center">{rows.length > 1 ? '#' : ''}</div>
          <div className="col-span-4">Target</div>
          <div className="col-span-6">Time</div>
          <div className="col-span-1 text-center">Done</div>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map(row => {
            const targetLabel =
              row.target_duration_seconds != null && row.target_duration_seconds > 0
                ? formatDuration(row.target_duration_seconds)
                : null
            return (
              <div
                key={row.set_number}
                className={`transition-colors ${row.completed ? 'bg-emerald-50/40' : ''}`}
              >
                <div className="px-3 py-2 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center">
                  {/* Mobile metadata row + done button. */}
                  <div className="flex items-center justify-between gap-2 mb-2 sm:hidden">
                    <span className="text-xs font-semibold text-slate-700">
                      {rows.length > 1 && (
                        <span className="tabular-nums">Round {row.set_number}</span>
                      )}
                      {rows.length > 1 && targetLabel && (
                        <span className="text-slate-400 font-normal"> · </span>
                      )}
                      {targetLabel ? (
                        <span className="font-normal text-slate-500">
                          target <span className="text-slate-700 font-medium tabular-nums">{targetLabel}</span>
                        </span>
                      ) : !rows.length || rows.length === 1 ? (
                        <span className="text-slate-400 italic">—</span>
                      ) : null}
                    </span>
                    {renderDone(row)}
                  </div>

                  {/* Desktop-only set + target columns. */}
                  <div className="hidden sm:block sm:col-span-1 text-center text-sm font-semibold text-slate-700 tabular-nums">
                    {rows.length > 1 ? row.set_number : ''}
                  </div>
                  <div className="hidden sm:block sm:col-span-4 text-xs text-slate-600 truncate">
                    {targetLabel ? (
                      <span className="font-medium tabular-nums">{targetLabel}</span>
                    ) : (
                      <span className="italic text-slate-400">—</span>
                    )}
                  </div>

                  {/* Time input — full width on mobile, 6-col on desktop. */}
                  <div className="sm:col-span-6">
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

                  {/* Desktop-only done column. */}
                  <div className="hidden sm:col-span-1 sm:flex sm:justify-center">
                    {renderDone(row)}
                  </div>
                </div>
                <PriorHint row={row} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Desktop-only column header — phones use the per-row mobile header instead. */}
      <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="col-span-1 text-center">Set</div>
        <div className="col-span-2">Target</div>
        <div className="col-span-4">Reps</div>
        <div className="col-span-4">Weight</div>
        <div className="col-span-1 text-center">Done</div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map(row => (
          <div
            key={row.set_number}
            className={`transition-colors ${row.completed ? 'bg-emerald-50/40' : ''}`}
          >
            <div className="px-3 py-2 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center">
              {/* Mobile-only metadata row: set # + target + done. */}
              <div className="flex items-center justify-between gap-2 mb-2 sm:hidden">
                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                  Set {row.set_number}
                  {row.target_reps && (
                    <span className="font-normal text-slate-500"> · target {row.target_reps}</span>
                  )}
                </span>
                {renderDone(row)}
              </div>

              {/* Desktop columns 1–2. */}
              <div className="hidden sm:block sm:col-span-1 text-center text-sm font-semibold text-slate-700 tabular-nums">
                {row.set_number}
              </div>
              <div className="hidden sm:block sm:col-span-2 text-xs text-slate-500 truncate">
                {row.target_reps || <span className="italic text-slate-400">—</span>}
              </div>

              {/* Inputs — two-up grid on mobile, columns 3–4 on desktop. `sm:contents`
                  collapses the wrapper at >=sm so each Input becomes a direct child of
                  the parent grid. */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <div className="sm:col-span-4">
                  {loaded ? (
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
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
                <div className="sm:col-span-4">
                  {loaded ? (
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
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
              </div>

              {/* Desktop-only done column. */}
              <div className="hidden sm:col-span-1 sm:flex sm:justify-center">
                {renderDone(row)}
              </div>
            </div>
            <PriorHint row={row} />
          </div>
        ))}
      </div>
    </div>
  )
}
