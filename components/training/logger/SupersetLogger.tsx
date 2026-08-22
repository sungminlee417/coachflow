'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Check, ChevronUp, RotateCcw } from 'lucide-react'
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
  type PriorPerformance,
} from '@/lib/training'
import { PreSetHint, PostSetHint } from '@/components/training/logger/SetHints'
import type { Exercise } from '@/lib/types'

// Module-level stable references so the per-row PostSetHint doesn't see
// a fresh `{}` / `() => {}` on every render. Supersets don't have a
// per-set collapse affordance (collapse is per-round), so these are
// inert placeholders for the shared component's required props.
const EMPTY_SET: Set<number> = new Set()
const noopCollapse = () => {}

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
  /** Fires once when every set of every exercise in the superset hits
   *  completed. The parent uses it to auto-collapse the superset card. */
  onAllSetsCompleted?: () => void
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
  onAllSetsCompleted,
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
  // `rowsByExercise`. Depends on scope too (not just persistedByExercise)
  // so a coach-side workout edit — which refetches the assignments cache
  // and hands us fresh exercise references — doesn't leave rows wiped to
  // prescribed blanks while this merge silently skips on a stable cache
  // Map. Local state still holds in-flight input drafts; we only stamp a
  // row when the cache has a persisted log for it.
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
  }, [persistedByExercise, assignmentId, exercises, loggedDate, variantSignature])

  // Prefill empty inputs from last session's actuals. Same pattern as
  // ExerciseSetLogger — only patches rows that have neither a persisted
  // log for today nor any user-typed values, so we never clobber.
  useEffect(() => {
    if (priorByKey.size === 0) return
    setRowsByExercise(prev => {
      const next = new Map<string, RowState[]>()
      for (const [exId, rows] of prev) {
        const scoped = persistedByExercise.get(exId) ?? new Map<number, SetLogRow>()
        next.set(
          exId,
          rows.map(r => {
            if (scoped.get(r.set_number)) return r
            if (
              r.reps_performed ||
              r.weight_performed ||
              r.duration_input
            ) {
              return r
            }
            const prior = priorByKey.get(priorKey(exId, r.set_number))
            if (!prior) return r
            return {
              ...r,
              reps_performed:
                prior.reps_performed != null ? String(prior.reps_performed) : '',
              weight_performed:
                prior.weight_performed != null
                  ? String(prior.weight_performed)
                  : '',
              duration_performed_seconds: prior.duration_performed_seconds,
              duration_input:
                prior.duration_performed_seconds != null
                  ? formatDuration(prior.duration_performed_seconds)
                  : '',
            }
          })
        )
      }
      return next
    })
  }, [priorByKey, persistedByExercise])

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

  // Reset this row's inputs back to last session's actuals — same
  // fields the prior-prefill effect uses. SupersetLogger doesn't own
  // the cardio-machine actuals (speed / incline / resistance) so those
  // aren't touched.
  const revertToPrior = (exerciseId: string, setNumber: number) => {
    const prior = priorByKey.get(priorKey(exerciseId, setNumber))
    if (!prior) return
    updateRow(exerciseId, setNumber, {
      weight_performed:
        prior.weight_performed != null ? String(prior.weight_performed) : '',
      reps_performed:
        prior.reps_performed != null ? String(prior.reps_performed) : '',
      duration_performed_seconds: prior.duration_performed_seconds,
      duration_input:
        prior.duration_performed_seconds != null
          ? formatDuration(prior.duration_performed_seconds)
          : '',
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

  // Parses a typed duration ("20:30", "30", "1h 20m") into seconds and
  // tidies the visible text to canonical form on blur. For an already-
  // completed row this also persists the new value (edit-after-complete);
  // for an unchecked row it stays local so future-date phantom rows can't
  // accumulate.
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
    if (next.completed) persist(next)
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

    // Prefill the next round's row for the same exercise — straight sets
    // almost always repeat. Only on forward completion, only when the
    // next row is still empty (so we don't clobber the user's typed
    // values or a row they intentionally cleared). SupersetLogger's
    // RowState doesn't track machine-specific cardio fields (speed /
    // incline / resistance) — those only render in the deep
    // ExerciseSetLogger — so for cardio we only carry duration forward.
    //
    // Critical: the emptiness check uses LATEST state inside the
    // `setRowsByExercise(prev => …)` callback — not closure-captured
    // `rowsByExercise` at the top of toggleComplete — so it sees any
    // prior-week prefill or in-flight edits that landed during the
    // `await persist(...)` above.
    if (next.completed) {
      const ex = exercises.find(e => e.id === exerciseId)
      const isCardio = ex?.exercise_type === 'cardio'
      setRowsByExercise(prev => {
        const scoped = prev.get(exerciseId)
        if (!scoped) return prev
        const updated = scoped.map(r => {
          if (r.set_number !== setNumber + 1) return r
          const isEmpty = isCardio
            ? !r.duration_input && r.duration_performed_seconds == null
            : !r.weight_performed && !r.reps_performed
          if (!isEmpty) return r
          if (isCardio) {
            return {
              ...r,
              duration_performed_seconds: next.duration_performed_seconds,
              duration_input:
                next.duration_performed_seconds != null
                  ? formatDuration(next.duration_performed_seconds)
                  : '',
            }
          }
          return {
            ...r,
            weight_performed: next.weight_performed,
            reps_performed: next.reps_performed,
          }
        })
        const out = new Map(prev)
        out.set(exerciseId, updated)
        return out
      })

      // If this completion just finished every row of every exercise in
      // the superset, tell the parent so it can auto-collapse the card.
      // Driven by the user's tap (not a useEffect on `rowsByExercise`) so
      // loading an already-completed superset from cache never re-fires
      // this — which would re-collapse the card the instant the user
      // re-expanded it. The just-completed (exerciseId, setNumber) pair
      // is treated as done in the check since closure rows still see it
      // as pending.
      const allOthersDone = exercises.every(ex => {
        if (!ex.id) return true
        const rows = rowsByExercise.get(ex.id)
        if (!rows || rows.length === 0) return false
        return rows.every(
          r =>
            (ex.id === exerciseId && r.set_number === setNumber) || r.completed
        )
      })
      if (allOthersDone) {
        onAllSetsCompleted?.()
      }
    }
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
                className="w-full bg-surface rounded-lg border border-emerald-300 hover:border-emerald-400 transition-colors cursor-pointer overflow-hidden text-left"
              >
                <div className="bg-emerald-soft px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-fg">
                      Round {setNumber}
                    </span>
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-500 text-white shrink-0">
                      <Check size={11} />
                    </span>
                    {summaries.map(s => (
                      <span
                        key={s.letter}
                        className="text-xs text-muted tabular-nums"
                      >
                        <span className="font-bold text-indigo-fg mr-0.5">{s.letter}</span>
                        {s.text}
                      </span>
                    ))}
                  </div>
                  {/* Hide the hint on phones — the cluster of per-exercise
                      summaries already crowds the row, and the whole card is
                      a tap target. */}
                  <span className="hidden sm:inline text-[10px] text-subtle shrink-0">
                    Tap to edit
                  </span>
                </div>
              </button>
              {!isLastRound && restBetweenRounds != null && restBetweenRounds > 0 && (
                <div className="flex items-center gap-2 my-1 px-3">
                  <div className="flex-1 h-px bg-elevated" />
                  <span className="text-[10px] font-medium text-subtle tabular-nums">
                    Rest {restBetweenRounds}s
                  </span>
                  <div className="flex-1 h-px bg-elevated" />
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
 complete ? 'text-emerald-fg ' : 'text-muted '
 }`}
            >
              Round {setNumber}
            </span>
            <div className="flex items-center gap-2">
              {complete && (
                <span className="text-[10px] font-semibold text-emerald-fg flex items-center gap-1">
                  <Check size={11} />
                  Complete
                </span>
              )}
              {headerCanCollapse && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted">
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
            className={`bg-surface rounded-lg border overflow-hidden ${
 complete ? 'border-emerald-300' : 'border-line '
 }`}
          >
            {headerCanCollapse ? (
              <button
                type="button"
                onClick={() => collapseRound(setNumber)}
                aria-label={`Collapse round ${setNumber}`}
                className={`w-full px-3 py-1.5 border-b flex items-center justify-between gap-2 cursor-pointer ${
 complete
 ? 'bg-emerald-soft hover:bg-emerald-strong border-emerald-line '
 : 'bg-elevated hover:bg-elevated border-line '
 }`}
              >
                {headerInner}
              </button>
            ) : (
              <div
                className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 ${
 complete
 ? 'bg-emerald-soft border-emerald-line '
 : 'bg-elevated border-line '
 }`}
              >
                {headerInner}
              </div>
            )}
            <div className="divide-y divide-line-subtle">
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
                return (
                  <div
                    key={`${ex.id}-${setNumber}`}
                    className={`px-3 py-2.5 transition-colors ${
                      row.completed ? 'bg-emerald-wash' : ''
                    }`}
                  >
                    <PreSetHint
                      row={row}
                      prior={prev}
                      loaded={loaded}
                      isCardio={isCardio}
                      className="flex items-center gap-2 text-[10px] mb-1.5 flex-wrap"
                    />
                    <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                      {/* min-w-0 on the inner cluster + min-w-0 on the name
                          itself lets `truncate` actually kick in — without it,
                          a long name pushes the badges down and shows up as
                          "A name… / B name…" on two lines. */}
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span
                          className={`text-[10px] font-bold tabular-nums shrink-0 ${
 isCardio ? 'text-amber-fg ' : 'text-indigo-fg '
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
                          className="text-sm font-medium text-foreground min-w-0 wrap-break-word"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                        {activeVariant && (
                          <span className="text-[9px] uppercase tracking-widest font-semibold text-indigo-fg bg-indigo-soft border border-indigo-line rounded px-1 py-px shrink-0">
                            Swapped
                          </span>
                        )}
                        {isCardio && (
                          <span className="text-[9px] uppercase tracking-widest font-semibold text-amber-fg bg-amber-soft border border-amber-line rounded px-1 py-px shrink-0">
                            Cardio
                          </span>
                        )}
                      </div>
                      {targetLabel && (
                        <span className="text-[10px] text-muted shrink-0">
                          target <span className="font-semibold">{targetLabel}</span>
                        </span>
                      )}
                    </div>
                    {isCardio ? (
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-center mb-1">
                        {loaded ? (
                          <Input
                            value={row.duration_input}
                            // Match the solo ExerciseSetLogger: completed
                            // rows lock against accidental overwrites.
                            // Toggle the check off to edit again.
                            readOnly={row.completed}
                            onChange={e =>
                              updateRow(ex.id!, setNumber, { duration_input: e.target.value })
                            }
                            onBlur={() => commitDuration(ex.id!, setNumber)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                commitDuration(ex.id!, setNumber)
                                toggleComplete(ex.id!, setNumber)
                              }
                            }}
                            placeholder="20:30 or 30"
                            className="text-sm py-1.5"
                          />
                        ) : (
                          <div className="h-8.5 w-full bg-line/70 rounded-lg animate-pulse" />
                        )}
                        {/* Action cluster: optional "revert to last
                            session" button + the green check.
                            `gap-2` keeps the two from crowding each
                            other; the grid's `auto` column expands. */}
                        <div className="flex items-center gap-2 shrink-0">
                          {(() => {
                            if (!loaded || row.completed || !prev) return null
                            const priorDuration =
                              prev.duration_performed_seconds != null
                                ? formatDuration(prev.duration_performed_seconds)
                                : ''
                            if (row.duration_input === priorDuration) return null
                            return (
                              <button
                                type="button"
                                onClick={() => revertToPrior(ex.id!, setNumber)}
                                aria-label="Revert to last session's value"
                                title="Revert to last session"
                                className="h-7 w-7 rounded-md border border-line text-subtle hover:text-foreground hover:border-subtle hover:bg-elevated flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <RotateCcw size={12} />
                              </button>
                            )
                          })()}
                          {loaded ? (
                            <button
                              type="button"
                              onClick={() => toggleComplete(ex.id!, setNumber)}
                              aria-label={row.completed ? 'Mark incomplete' : 'Mark complete'}
                              aria-pressed={row.completed}
                              className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
 row.completed
 ? 'bg-emerald-500 border-emerald-500 text-white'
 : 'border-line text-transparent hover:border-subtle'
 }`}
                            >
                              <Check size={14} />
                            </button>
                          ) : (
                            <div className="h-7 w-7 bg-line/70 rounded-md animate-pulse" />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center mb-1">
                        {loaded ? (
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={row.weight_performed}
                            // Lock checked rows so an accidental tap
                            // can't silently overwrite a logged value
                            // and re-persist on blur.
                            readOnly={row.completed}
                            onChange={e =>
                              updateRow(ex.id!, setNumber, { weight_performed: e.target.value })
                            }
                            onBlur={() => {
                              // Same edit-after-complete behavior as the
                              // deep ExerciseSetLogger: blurring an
                              // already-saved row writes the new value,
                              // blurring an unchecked row stays local
                              // (so future-date phantoms stay impossible).
                              const current = rowsByExercise
                                .get(ex.id!)
                                ?.find(r => r.set_number === setNumber)
                              if (current?.completed) persist(current)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                toggleComplete(ex.id!, setNumber)
                              }
                            }}
                            placeholder="weight"
                            className="text-sm py-1.5"
                          />
                        ) : (
                          <div className="h-8.5 w-full bg-line/70 rounded-lg animate-pulse" />
                        )}
                        {loaded ? (
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            value={row.reps_performed}
                            readOnly={row.completed}
                            onChange={e =>
                              updateRow(ex.id!, setNumber, { reps_performed: e.target.value })
                            }
                            onBlur={() => {
                              const current = rowsByExercise
                                .get(ex.id!)
                                ?.find(r => r.set_number === setNumber)
                              if (current?.completed) persist(current)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                toggleComplete(ex.id!, setNumber)
                              }
                            }}
                            placeholder="reps"
                            className="text-sm py-1.5"
                          />
                        ) : (
                          <div className="h-8.5 w-full bg-line/70 rounded-lg animate-pulse" />
                        )}
                        {/* Action cluster — see the cardio branch
                            above for the rationale. `gap-2` between
                            revert and check keeps the controls from
                            feeling tight against each other. */}
                        <div className="flex items-center gap-2 shrink-0">
                          {(() => {
                            if (!loaded || row.completed || !prev) return null
                            const priorWeight =
                              prev.weight_performed != null
                                ? String(prev.weight_performed)
                                : ''
                            const priorReps =
                              prev.reps_performed != null
                                ? String(prev.reps_performed)
                                : ''
                            if (
                              row.weight_performed === priorWeight &&
                              row.reps_performed === priorReps
                            ) {
                              return null
                            }
                            return (
                              <button
                                type="button"
                                onClick={() => revertToPrior(ex.id!, setNumber)}
                                aria-label="Revert to last session's values"
                                title="Revert to last session"
                                className="h-7 w-7 rounded-md border border-line text-subtle hover:text-foreground hover:border-subtle hover:bg-elevated flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <RotateCcw size={12} />
                              </button>
                            )
                          })()}
                          {loaded ? (
                            <button
                              type="button"
                              onClick={() => toggleComplete(ex.id!, setNumber)}
                              aria-label={row.completed ? 'Mark set incomplete' : 'Mark set complete'}
                              aria-pressed={row.completed}
                              className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
 row.completed
 ? 'bg-emerald-500 border-emerald-500 text-white'
 : 'border-line text-transparent hover:border-subtle'
 }`}
                            >
                              <Check size={14} />
                            </button>
                          ) : (
                            <div className="h-7 w-7 bg-line/70 rounded-md animate-pulse" />
                          )}
                        </div>
                      </div>
                    )}
                    <PostSetHint
                      row={row}
                      prior={prev}
                      loaded={loaded}
                      isCardio={isCardio}
                      // Supersets collapse by round, not by individual
                      // set — the shared collapse affordance is unused
                      // here, so we pass an always-empty set + no-op.
                      manuallyExpanded={EMPTY_SET}
                      onCollapse={noopCollapse}
                      className="flex items-center justify-end gap-2 text-[10px]"
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {!isLastRound && restBetweenRounds != null && restBetweenRounds > 0 && (
            <div className="flex items-center gap-2 my-1 px-3">
              <div className="flex-1 h-px bg-elevated" />
              <span className="text-[10px] font-medium text-subtle tabular-nums">
                Rest {restBetweenRounds}s
              </span>
              <div className="flex-1 h-px bg-elevated" />
            </div>
          )}
          </div>
        )
      })}
    </div>
  )
}
