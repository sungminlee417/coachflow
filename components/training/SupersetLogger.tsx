'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Check, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react'
import { formatDuration, parseDuration } from '@/lib/utils'
import {
  useSaveSetLog,
  useSupersetSetLogs,
  type SetLogRow,
} from '@/lib/hooks/use-set-logs'
import { useRestTimer } from '@/components/ui/RestTimer'
import {
  buildPrescribedSets,
  fetchPriorPerformanceBatch,
  formatPriorHint,
  getRepRangeFeedback,
  isImprovement,
  type PriorPerformance,
} from '@/lib/training'
import type { Exercise } from '@/lib/types'

interface SupersetLoggerProps {
  /** Trainee whose set_logs we read/write — passed to the save mutation
   *  so the Today day-summary cache invalidates correctly. */
  clientId: string
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

// Stable empty fallback for the persisted-rows merge effect so its
// `[persistedByExercise]` dependency doesn't change identity on each
// render before the query resolves.
const EMPTY_PERSISTED_MAP: Map<string, Map<number, SetLogRow>> = new Map()

export function SupersetLogger({
  clientId,
  assignmentId,
  exercises,
  loggedDate,
  variantByExerciseId,
}: SupersetLoggerProps) {
  const supabase = useSupabase()
  const restTimer = useRestTimer()
  const [rowsByExercise, setRowsByExercise] = useState<Map<string, RowState[]>>(() =>
    buildInitialMap(exercises)
  )
  const [priorByKey, setPriorByKey] = useState<PriorMap>(new Map())
  // Round numbers the user manually re-expanded after auto-collapse fired.
  // Reset on every load so a freshly-completed round always auto-collapses.
  const [manuallyExpandedRounds, setManuallyExpandedRounds] = useState<Set<number>>(new Set())

  // Set logs for every exercise in the round, in one query. The hook
  // also stamps the per-exercise cache so a deep ExerciseSetLogger
  // opened separately reuses the same data.
  const exerciseIds = exercises.map(e => e.id).filter(Boolean) as string[]
  const setLogsQuery = useSupersetSetLogs({
    assignmentId,
    exerciseIds,
    date: loggedDate,
  })
  const persistedByExercise = setLogsQuery.data ?? EMPTY_PERSISTED_MAP
  const loaded = setLogsQuery.isSuccess
  const saveSetLog = useSaveSetLog()

  // Variant fingerprint used as a stable cache key for the prior fetch.
  const variantSignature = useMemo(() => {
    const sorted = [...exerciseIds].sort()
    return sorted
      .map(id => `${id}=${variantByExerciseId?.get(id) ?? ''}`)
      .join(',')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIds.join(','), variantByExerciseId])

  // Prior-performance batch. Stays in the local query cache too so
  // navigating off and back shows ghost hints instantly.
  const priorQuery = useQuery({
    queryKey: [
      'set_logs',
      'superset-prior',
      assignmentId,
      variantSignature,
      loggedDate,
    ] as const,
    enabled: exerciseIds.length > 0,
    queryFn: async () => {
      const variantMap = new Map<string, string | null>()
      for (const id of exerciseIds) {
        variantMap.set(id, variantByExerciseId?.get(id) ?? null)
      }
      return fetchPriorPerformanceBatch(
        supabase,
        assignmentId,
        exerciseIds,
        loggedDate,
        variantMap
      )
    },
  })

  // Flatten priors into the (exId, setNum) → prior map the renderer wants.
  useEffect(() => {
    const flat: PriorMap = new Map()
    const data = priorQuery.data
    if (data) {
      for (const [exId, byNum] of data) {
        for (const [setNum, prev] of byNum) {
          flat.set(priorKey(exId, setNum), prev)
        }
      }
    }
    setPriorByKey(flat)
  }, [priorQuery.data])

  // Reset draft inputs when the scope changes. See the matching comment
  // in ExerciseSetLogger — this is the legitimate "mirror server state
  // into a mutable draft" pattern.
  useEffect(() => {
    setRowsByExercise(buildInitialMap(exercises))
    setManuallyExpandedRounds(new Set())
  }, [assignmentId, exercises, loggedDate, variantSignature])

  // Merge persisted rows from the query cache back into local
  // `rowsByExercise`. Local state still holds in-flight input drafts;
  // we only stamp a row when the cache has a persisted log for it.
  useEffect(() => {
    setRowsByExercise(prev => {
      const next = new Map<string, RowState[]>()
      for (const [exId, rows] of prev) {
        const scoped = persistedByExercise.get(exId) ?? new Map<number, SetLogRow>()
        next.set(
          exId,
          rows.map(r => {
            const log = scoped.get(r.set_number)
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
  }, [persistedByExercise])

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
    const reps = row.reps_performed === '' ? null : parseFloat(row.reps_performed)
    const weight = row.weight_performed === '' ? null : parseFloat(row.weight_performed)
    // SupersetLogger doesn't surface cardio-machine fields (the deep
    // ExerciseSetLogger owns those). Preserve any values the cache
    // already has for this row so a partial superset save doesn't blow
    // away machine columns set elsewhere.
    const existing = persistedByExercise.get(row.exerciseId)?.get(row.set_number)
    const persisted: SetLogRow = {
      set_number: row.set_number,
      reps_performed: Number.isNaN(reps as number) ? null : reps,
      weight_performed: Number.isNaN(weight as number) ? null : weight,
      duration_performed_seconds: row.duration_performed_seconds,
      speed_performed: existing?.speed_performed ?? null,
      incline_performed: existing?.incline_performed ?? null,
      resistance_performed: existing?.resistance_performed ?? null,
      completed: row.completed,
    }
    try {
      await saveSetLog.mutateAsync({
        assignmentId,
        exerciseId: row.exerciseId,
        date: loggedDate,
        clientId,
        row: persisted,
      })
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
    // Each completion cycle starts fresh — re-completing should auto-collapse
    // the round again. Drop the manual override for this round if present.
    setManuallyExpandedRounds(prev => {
      if (!prev.has(setNumber)) return prev
      const out = new Set(prev)
      out.delete(setNumber)
      return out
    })

    // For supersets, rest is between rounds — fire the timer only when this
    // toggle finishes the LAST row of the round. Compute the post-toggle
    // round status here since the state hasn't flushed yet.
    if (next.completed) {
      const willRoundBeComplete = exercises.every(ex => {
        if (!ex.id) return true
        const r = rowsByExercise.get(ex.id)?.find(rr => rr.set_number === setNumber)
        if (!r) return true
        if (ex.id === exerciseId) return next.completed
        return r.completed
      })
      if (willRoundBeComplete) {
        const restSec = exercises[exercises.length - 1]?.rest_seconds ?? 0
        if (restSec > 0) restTimer.start(restSec, `Round ${setNumber}`)
      }
    }

    await persist(next)
  }

  // Re-expand a round that auto-collapsed after all its rows were completed.
  const expandRound = (setNumber: number) => {
    setManuallyExpandedRounds(prev => {
      if (prev.has(setNumber)) return prev
      const out = new Set(prev)
      out.add(setNumber)
      return out
    })
  }

  // Re-collapse a round the user previously tapped to expand.
  const collapseRound = (setNumber: number) => {
    setManuallyExpandedRounds(prev => {
      if (!prev.has(setNumber)) return prev
      const out = new Set(prev)
      out.delete(setNumber)
      return out
    })
  }

  const maxRounds = useMemo(
    () =>
      exercises.reduce((max, ex) => {
        const rows = ex.id ? rowsByExercise.get(ex.id) : undefined
        return Math.max(max, rows?.length ?? buildPrescribedSets(ex).length)
      }, 0),
    [exercises, rowsByExercise]
  )

  // Precompute per-round completion once instead of recomputing inside the
  // render loop, where each iteration would re-scan every exercise. On a
  // 5-round superset with 4 exercises that drops 20 lookups to 5.
  const roundsComplete = useMemo(() => {
    const out = new Array<boolean>(maxRounds)
    for (let i = 0; i < maxRounds; i++) {
      const setNumber = i + 1
      let touched = false
      let allDone = true
      for (const ex of exercises) {
        if (!ex.id) continue
        const row = rowsByExercise.get(ex.id)?.find(r => r.set_number === setNumber)
        if (!row) continue
        touched = true
        if (!row.completed) {
          allDone = false
          break
        }
      }
      out[i] = touched && allDone
    }
    return out
  }, [maxRounds, exercises, rowsByExercise])

  if (maxRounds === 0) return null

  const restBetweenRounds = exercises[exercises.length - 1]?.rest_seconds ?? null

  // Tiny per-exercise summary used in the auto-collapsed round bar:
  // strength → "A 135×8", cardio → "B 25:30".
  const summarizeRow = (
    ex: Exercise,
    row: RowState,
    letterIdx: number
  ): { letter: string; text: string } => {
    const letter = POSITION_LETTERS[letterIdx] ?? `${letterIdx + 1}`
    if (ex.exercise_type === 'cardio') {
      const t =
        row.duration_performed_seconds != null
          ? formatDuration(row.duration_performed_seconds)
          : '—'
      return { letter, text: t }
    }
    const w = row.weight_performed
    const r = row.reps_performed
    const text =
      w !== '' && r !== ''
        ? `${w}×${r}`
        : r !== ''
          ? `${r} reps`
          : w !== ''
            ? `${w}`
            : '—'
    return { letter, text }
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: maxRounds }, (_, roundIdx) => {
        const setNumber = roundIdx + 1
        const complete = roundsComplete[roundIdx] ?? false
        const isLastRound = setNumber === maxRounds
        const isAutoCollapsed =
          loaded && complete && !manuallyExpandedRounds.has(setNumber)

        // Collapsed round bar — one tappable line summarizing every exercise
        // in the round. Tap to re-expand the full editing UI.
        if (isAutoCollapsed) {
          const summaries = exercises
            .map((ex, exIdx) => {
              if (!ex.id) return null
              const row = rowsByExercise.get(ex.id)?.find(r => r.set_number === setNumber)
              if (!row) return null
              return summarizeRow(ex, row, exIdx)
            })
            .filter((s): s is { letter: string; text: string } => s !== null)

          return (
            <div key={`round-${setNumber}`}>
              <button
                type="button"
                onClick={() => expandRound(setNumber)}
                aria-expanded={false}
                aria-label={`Expand round ${setNumber}`}
                className="w-full bg-white dark:bg-slate-900 rounded-lg border border-emerald-300 hover:border-emerald-400 transition-colors cursor-pointer overflow-hidden text-left"
              >
                <div className="bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                      Round {setNumber}
                    </span>
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-500 text-white shrink-0">
                      <Check size={11} />
                    </span>
                    {summaries.map(s => (
                      <span
                        key={s.letter}
                        className="text-xs text-slate-600 dark:text-slate-300 tabular-nums"
                      >
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-0.5">{s.letter}</span>
                        {s.text}
                      </span>
                    ))}
                  </div>
                  {/* Hide the hint on phones — the cluster of per-exercise
                      summaries already crowds the row, and the whole card is
                      a tap target. */}
                  <span className="hidden sm:inline text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                    Tap to edit
                  </span>
                </div>
              </button>
              {!isLastRound && restBetweenRounds != null && restBetweenRounds > 0 && (
                <div className="flex items-center gap-2 my-1 px-3">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 tabular-nums">
                    Rest {restBetweenRounds}s
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
              )}
            </div>
          )
        }

        // If the round is complete and the user manually expanded it back open,
        // tapping the header recollapses — saves them from unchecking just to
        // tidy up.
        const headerCanCollapse =
          loaded && complete && manuallyExpandedRounds.has(setNumber)

        const headerInner = (
          <>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                complete ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Round {setNumber}
            </span>
            <div className="flex items-center gap-2">
              {complete && (
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <Check size={11} />
                  Complete
                </span>
              )}
              {headerCanCollapse && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <ChevronUp size={11} />
                  Collapse
                </span>
              )}
            </div>
          </>
        )

        return (
          <div key={`round-${setNumber}`}>
          <div
            className={`bg-white dark:bg-slate-900 rounded-lg border overflow-hidden ${
              complete ? 'border-emerald-300' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            {headerCanCollapse ? (
              <button
                type="button"
                onClick={() => collapseRound(setNumber)}
                aria-label={`Collapse round ${setNumber}`}
                className={`w-full px-3 py-1.5 border-b flex items-center justify-between gap-2 cursor-pointer ${
                  complete
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
              >
                {headerInner}
              </button>
            ) : (
              <div
                className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 ${
                  complete
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
              >
                {headerInner}
              </div>
            )}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
                // Pre-set weight suggestion based on last session's
                // reps-vs-target outcome. Strength only — cardio has no
                // load to adjust here.
                let preSuggestion: { direction: 'up' | 'down'; weight: number } | null = null
                if (!isCardio && prev) {
                  const fb = getRepRangeFeedback(
                    row.target_reps,
                    prev.reps_performed,
                    prev.weight_performed
                  )
                  if (fb && fb.state !== 'on-target' && prev.weight_performed != null) {
                    const w = prev.weight_performed + fb.delta
                    if (w > 0) {
                      preSuggestion = { direction: fb.delta > 0 ? 'up' : 'down', weight: w }
                    }
                  }
                }
                return (
                  <div
                    key={`${ex.id}-${setNumber}`}
                    className={`px-3 py-2.5 transition-colors ${
                      row.completed ? 'bg-emerald-50/40' : ''
                    }`}
                  >
                    {(priorText || preSuggestion) && (
                      <div className="flex items-center gap-2 text-[10px] mb-1.5 flex-wrap">
                        {priorText && (
                          <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                            Last:{' '}
                            <span className="font-medium text-slate-500 dark:text-slate-400">{priorText}</span>
                          </span>
                        )}
                        {preSuggestion && (
                          <span
                            className={`inline-flex items-center gap-1 font-medium border rounded-full px-2 py-0.5 tabular-nums ${
                              preSuggestion.direction === 'up'
                                ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900'
                                : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900'
                            }`}
                          >
                            {preSuggestion.direction === 'up' ? (
                              <ArrowUp size={11} />
                            ) : (
                              <ArrowDown size={11} />
                            )}
                            Try {preSuggestion.weight}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                      {/* min-w-0 on the inner cluster + min-w-0 on the name
                          itself lets `truncate` actually kick in — without it,
                          a long name pushes the badges down and shows up as
                          "A name… / B name…" on two lines. */}
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span
                          className={`text-[10px] font-bold tabular-nums shrink-0 ${
                            isCardio ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {positionLetter}
                        </span>
                        {/* No `truncate` here — once you've expanded the round
                            you're actively lifting, so we'd rather show the
                            full exercise name (wrapping to a second line if
                            needed) than hide it behind ellipses. `title=` is
                            a fallback for desktop hover. */}
                        <span
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 min-w-0 wrap-break-word"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                        {activeVariant && (
                          <span className="text-[9px] uppercase tracking-widest font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded px-1 py-px shrink-0">
                            Swapped
                          </span>
                        )}
                        {isCardio && (
                          <span className="text-[9px] uppercase tracking-widest font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-1 py-px shrink-0">
                            Cardio
                          </span>
                        )}
                      </div>
                      {targetLabel && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
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
                                : 'border-slate-300 dark:border-slate-600 text-transparent hover:border-slate-400'
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
                                : 'border-slate-300 dark:border-slate-600 text-transparent hover:border-slate-400'
                            }`}
                          >
                            <Check size={14} />
                          </button>
                        ) : (
                          <div className="h-7 w-7 bg-slate-200/70 rounded-md animate-pulse" />
                        )}
                      </div>
                    )}
                    {improved && (
                      <div className="flex items-center justify-end gap-2 text-[10px]">
                        <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-1.5 py-px font-semibold tabular-nums">
                          ↑ Beat last
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {!isLastRound && restBetweenRounds != null && restBetweenRounds > 0 && (
            <div className="flex items-center gap-2 my-1 px-3">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 tabular-nums">
                Rest {restBetweenRounds}s
              </span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>
          )}
          </div>
        )
      })}
    </div>
  )
}
