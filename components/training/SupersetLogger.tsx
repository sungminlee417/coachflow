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

interface SupersetLoggerProps {
  assignmentId: string
  exercises: Exercise[]
  loggedDate: string
  /** Active substitution per exercise id (null/missing = original). Drives
   *  variant-aware prior-performance lookups so a swapped exercise compares
   *  against its own history, not the unrelated original. */
  variantByExerciseId?: Map<string, string | null>
}

// (exerciseId, setNumber) → previous-week performance.
type PriorMap = Map<string, PriorPerformance>
const priorKey = (exerciseId: string, setNumber: number) => `${exerciseId}-${setNumber}`

interface RowState {
  exerciseId: string
  set_number: number
  // Prescriptions
  target_reps: string
  target_duration_seconds: number | null
  // Strength inputs
  reps_performed: string
  weight_performed: string
  // Cardio inputs (free-text → seconds on blur)
  duration_input: string
  duration_performed_seconds: number | null
  completed: boolean
}

const POSITION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

// Synchronous, prescription-only initial state. Lets the entire superset
// render on the first paint so the round structure doesn't pop in/jump.
const buildInitialMap = (exercises: Exercise[]): Map<string, RowState[]> => {
  const next = new Map<string, RowState[]>()
  for (const ex of exercises) {
    if (!ex.id) continue
    next.set(
      ex.id,
      buildPrescribedSets(ex).map(p => ({
        exerciseId: ex.id!,
        set_number: p.set_number,
        target_reps: p.target_reps ?? '',
        target_duration_seconds: p.target_duration_seconds ?? null,
        reps_performed: '',
        weight_performed: '',
        duration_input: '',
        duration_performed_seconds: null,
        completed: false,
      }))
    )
  }
  return next
}

export function SupersetLogger({
  assignmentId,
  exercises,
  loggedDate,
  variantByExerciseId,
}: SupersetLoggerProps) {
  const supabase = useSupabase()
  const [rowsByExercise, setRowsByExercise] = useState<Map<string, RowState[]>>(() =>
    buildInitialMap(exercises)
  )
  const [loaded, setLoaded] = useState(false)
  const [priorByKey, setPriorByKey] = useState<PriorMap>(new Map())

  // Stable strings so the effect reruns on identity changes without putting
  // complex expressions in the dependency array.
  const exerciseIdsKey = exercises.map(e => e.id).join(',')
  const variantsKey = Array.from(variantByExerciseId?.entries() ?? [])
    .map(([k, v]) => `${k}=${v ?? ''}`)
    .join('|')

  useEffect(() => {
    let cancelled = false
    setRowsByExercise(buildInitialMap(exercises))
    setLoaded(false)
    setPriorByKey(new Map())

    const load = async () => {
      const exerciseIds = exercises.map(e => e.id).filter(Boolean) as string[]
      if (exerciseIds.length === 0) return

      // Today's logs + each exercise's most-recent-prior performance, in parallel.
      const [todayResult, ...priorMaps] = await Promise.all([
        supabase
          .from('set_logs')
          .select('exercise_id, set_number, reps_performed, weight_performed, duration_performed_seconds, completed')
          .eq('assignment_id', assignmentId)
          .in('exercise_id', exerciseIds)
          .eq('logged_date', loggedDate),
        ...exerciseIds.map(exId =>
          fetchPriorPerformance(
            supabase,
            assignmentId,
            exId,
            loggedDate,
            variantByExerciseId?.get(exId) ?? null
          ).then(map => ({ exId, map }))
        ),
      ])

      if (cancelled) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logIndex = new Map<string, any>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (todayResult.data ?? []).map((l: any) => [`${l.exercise_id}-${l.set_number}`, l])
      )

      setRowsByExercise(prev => {
        const next = new Map<string, RowState[]>()
        for (const [exId, rows] of prev) {
          next.set(
            exId,
            rows.map(r => {
              const log = logIndex.get(`${exId}-${r.set_number}`)
              if (!log) return r
              const performedSeconds = log.duration_performed_seconds ?? null
              return {
                ...r,
                reps_performed:
                  log.reps_performed != null ? String(log.reps_performed) : '',
                weight_performed:
                  log.weight_performed != null ? String(log.weight_performed) : '',
                duration_input:
                  performedSeconds != null ? formatDuration(performedSeconds) : '',
                duration_performed_seconds: performedSeconds,
                completed: !!log.completed,
              }
            })
          )
        }
        return next
      })

      // Flatten the per-exercise prior maps into a single (exId, setNum) → prior.
      const flat: PriorMap = new Map()
      for (const { exId, map } of priorMaps as { exId: string; map: Map<number, PriorPerformance> }[]) {
        for (const [setNum, prev] of map) {
          flat.set(priorKey(exId, setNum), prev)
        }
      }
      setPriorByKey(flat)
      setLoaded(true)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, loggedDate, exerciseIdsKey, variantsKey])

  const updateRow = (exerciseId: string, setNumber: number, patch: Partial<RowState>) => {
    setRowsByExercise(prev => {
      const next = new Map(prev)
      const rows = next.get(exerciseId)
      if (!rows) return prev
      next.set(
        exerciseId,
        rows.map(r => (r.set_number === setNumber ? { ...r, ...patch } : r))
      )
      return next
    })
  }

  const persist = async (row: RowState) => {
    try {
      const reps = row.reps_performed === '' ? null : parseFloat(row.reps_performed)
      const weight = row.weight_performed === '' ? null : parseFloat(row.weight_performed)
      const { error } = await supabase
        .from('set_logs')
        .upsert(
          {
            assignment_id: assignmentId,
            exercise_id: row.exerciseId,
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
    }
  }

  const commitDuration = (exerciseId: string, setNumber: number) => {
    const row = rowsByExercise.get(exerciseId)?.find(r => r.set_number === setNumber)
    if (!row) return
    const parsed = parseDuration(row.duration_input)
    const next: RowState = {
      ...row,
      duration_performed_seconds: parsed,
      duration_input: parsed != null ? formatDuration(parsed) : row.duration_input,
    }
    updateRow(exerciseId, setNumber, {
      duration_performed_seconds: next.duration_performed_seconds,
      duration_input: next.duration_input,
    })
    persist(next)
  }

  const toggleComplete = async (exerciseId: string, setNumber: number) => {
    const row = rowsByExercise.get(exerciseId)?.find(r => r.set_number === setNumber)
    if (!row) return
    const next = { ...row, completed: !row.completed }
    updateRow(exerciseId, setNumber, { completed: next.completed })
    await persist(next)
  }

  const maxRounds = exercises.reduce((max, ex) => {
    const rows = ex.id ? rowsByExercise.get(ex.id) : undefined
    return Math.max(max, rows?.length ?? buildPrescribedSets(ex).length)
  }, 0)

  if (maxRounds === 0) return null

  const isRoundComplete = (setNumber: number): boolean => {
    let touched = false
    for (const ex of exercises) {
      if (!ex.id) continue
      const row = rowsByExercise.get(ex.id)?.find(r => r.set_number === setNumber)
      if (!row) continue
      touched = true
      if (!row.completed) return false
    }
    return touched
  }

  const restBetweenRounds = exercises[exercises.length - 1]?.rest_seconds ?? null

  return (
    <div className="space-y-2">
      {Array.from({ length: maxRounds }, (_, roundIdx) => {
        const setNumber = roundIdx + 1
        const complete = isRoundComplete(setNumber)
        const isLastRound = setNumber === maxRounds
        return (
          <div key={`round-${setNumber}`}>
          <div
            className={`bg-white rounded-lg border overflow-hidden ${
              complete ? 'border-emerald-300' : 'border-slate-200'
            }`}
          >
            <div
              className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 ${
                complete
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${
                  complete ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                Round {setNumber}
              </span>
              {complete && (
                <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                  <Check size={11} />
                  Complete
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {exercises.map((ex, exIdx) => {
                if (!ex.id) return null
                const row = rowsByExercise.get(ex.id)?.find(r => r.set_number === setNumber)
                if (!row) return null
                const positionLetter = POSITION_LETTERS[exIdx] ?? `${exIdx + 1}`
                const isCardio = ex.exercise_type === 'cardio'
                const activeVariant = ex.id ? variantByExerciseId?.get(ex.id) ?? null : null
                const displayName = activeVariant ?? ex.name
                const targetLabel = isCardio
                  ? row.target_duration_seconds && row.target_duration_seconds > 0
                    ? formatDuration(row.target_duration_seconds)
                    : null
                  : row.target_reps || null
                const prev = loaded ? priorByKey.get(priorKey(ex.id, setNumber)) : undefined
                const priorText = prev ? formatPriorHint(prev, isCardio) : null
                const improved = prev ? isImprovement(row, prev, isCardio) : false
                return (
                  <div
                    key={`${ex.id}-${setNumber}`}
                    className={`px-3 py-2.5 transition-colors ${
                      row.completed ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span
                          className={`text-[10px] font-bold tabular-nums ${
                            isCardio ? 'text-amber-600' : 'text-indigo-600'
                          }`}
                        >
                          {positionLetter}
                        </span>
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {displayName}
                        </span>
                        {activeVariant && (
                          <span className="text-[9px] uppercase tracking-widest font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1 py-px">
                            Swapped
                          </span>
                        )}
                        {isCardio && (
                          <span className="text-[9px] uppercase tracking-widest font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-px">
                            Cardio
                          </span>
                        )}
                      </div>
                      {targetLabel && (
                        <span className="text-[10px] text-slate-500 shrink-0">
                          target <span className="font-semibold">{targetLabel}</span>
                        </span>
                      )}
                    </div>
                    {isCardio ? (
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-center mb-1">
                        {loaded ? (
                          <Input
                            value={row.duration_input}
                            onChange={e =>
                              updateRow(ex.id!, setNumber, { duration_input: e.target.value })
                            }
                            onBlur={() => commitDuration(ex.id!, setNumber)}
                            placeholder="20:30 or 30"
                            className="text-sm py-1.5"
                          />
                        ) : (
                          <div className="h-8.5 w-full bg-slate-200/70 rounded-lg animate-pulse" />
                        )}
                        {loaded ? (
                          <button
                            type="button"
                            onClick={() => toggleComplete(ex.id!, setNumber)}
                            aria-label={row.completed ? 'Mark incomplete' : 'Mark complete'}
                            aria-pressed={row.completed}
                            className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                              row.completed
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-slate-300 text-transparent hover:border-slate-400'
                            }`}
                          >
                            <Check size={14} />
                          </button>
                        ) : (
                          <div className="h-7 w-7 bg-slate-200/70 rounded-md animate-pulse" />
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center mb-1">
                        {loaded ? (
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={row.weight_performed}
                            onChange={e =>
                              updateRow(ex.id!, setNumber, { weight_performed: e.target.value })
                            }
                            onBlur={() => {
                              const current = rowsByExercise
                                .get(ex.id!)
                                ?.find(r => r.set_number === setNumber)
                              if (current) persist(current)
                            }}
                            placeholder="weight"
                            className="text-sm py-1.5"
                          />
                        ) : (
                          <div className="h-8.5 w-full bg-slate-200/70 rounded-lg animate-pulse" />
                        )}
                        {loaded ? (
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={row.reps_performed}
                            onChange={e =>
                              updateRow(ex.id!, setNumber, { reps_performed: e.target.value })
                            }
                            onBlur={() => {
                              const current = rowsByExercise
                                .get(ex.id!)
                                ?.find(r => r.set_number === setNumber)
                              if (current) persist(current)
                            }}
                            placeholder="reps"
                            className="text-sm py-1.5"
                          />
                        ) : (
                          <div className="h-8.5 w-full bg-slate-200/70 rounded-lg animate-pulse" />
                        )}
                        {loaded ? (
                          <button
                            type="button"
                            onClick={() => toggleComplete(ex.id!, setNumber)}
                            aria-label={row.completed ? 'Mark set incomplete' : 'Mark set complete'}
                            aria-pressed={row.completed}
                            className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                              row.completed
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-slate-300 text-transparent hover:border-slate-400'
                            }`}
                          >
                            <Check size={14} />
                          </button>
                        ) : (
                          <div className="h-7 w-7 bg-slate-200/70 rounded-md animate-pulse" />
                        )}
                      </div>
                    )}
                    {priorText && (
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-slate-400 tabular-nums">
                          Last: <span className="font-medium text-slate-500">{priorText}</span>
                        </span>
                        {improved && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px font-semibold tabular-nums">
                            ↑ Beat last
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {!isLastRound && restBetweenRounds != null && restBetweenRounds > 0 && (
            <div className="flex items-center gap-2 my-1 px-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[10px] font-medium text-slate-400 tabular-nums">
                Rest {restBetweenRounds}s
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          )}
          </div>
        )
      })}
    </div>
  )
}
