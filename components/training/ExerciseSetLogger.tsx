'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Check, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react'
import { formatDuration, parseDuration } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  useExerciseSetLogs,
  useSaveSetLog,
  type SetLogRow,
} from '@/lib/hooks/use-set-logs'
import { queryKeys } from '@/lib/query-keys'
import { getCardioFields, type CardioSubtype } from '@/lib/cardio'
import { useRestTimer } from '@/components/ui/RestTimer'
import {
  buildPrescribedSets,
  fetchPriorPerformance,
  formatPriorHint,
  getRepRangeFeedback,
  isImprovement,
  type PriorPerformance,
} from '@/lib/training'
import type { Exercise } from '@/lib/types'

// Stable empty fallback so the merge effect's `[persistedRows]` dep
// doesn't change identity on each render before the query resolves.
const EMPTY_SET_LOGS: Map<number, SetLogRow> = new Map()

interface ExerciseSetLoggerProps {
  /** Trainee whose set logs we're reading/writing — used by the save
   *  mutation to invalidate the day-summary cache the Today dashboard
   *  reads. */
  clientId: string
  assignmentId: string
  exercise: Exercise
  /** Date the user is logging against — drives both the upsert and the
   * "previous performance" lookup. */
  loggedDate: string
  /** When the trainee swapped this exercise for the day, the substitute name.
   *  Null means the original is in play. Drives variant-aware prior matching. */
  currentVariant?: string | null
}

interface RowState {
  set_number: number
  target_reps: string
  target_duration_seconds: number | null
  target_speed: string | null
  target_incline: string | null
  target_resistance: string | null
  reps_performed: string
  weight_performed: string
  duration_input: string
  duration_performed_seconds: number | null
  // Cardio actuals are kept as strings while editing (so the user can clear
  // the field to "" without flipping to NaN), then parsed at persist time.
  speed_performed: string
  incline_performed: string
  resistance_performed: string
  completed: boolean
}

const buildInitialRows = (exercise: Exercise): RowState[] =>
  buildPrescribedSets(exercise).map(p => ({
    set_number: p.set_number,
    target_reps: p.target_reps ?? '',
    target_duration_seconds: p.target_duration_seconds ?? null,
    target_speed: p.target_speed ?? null,
    target_incline: p.target_incline ?? null,
    target_resistance: p.target_resistance ?? null,
    reps_performed: '',
    weight_performed: '',
    duration_input: '',
    duration_performed_seconds: null,
    speed_performed: '',
    incline_performed: '',
    resistance_performed: '',
    completed: false,
  }))

// Pre-set "Last: X · Try Y" hint strip. Pulled out of ExerciseSetLogger so
// it doesn't get re-declared as a new component type on every parent render
// (which would unmount/remount inputs and steal focus mid-edit).
function PreSetHint({
  row,
  prior,
  loaded,
  isCardio,
}: {
  row: RowState
  prior: PriorPerformance | undefined
  loaded: boolean
  isCardio: boolean
}) {
  const prev = loaded ? prior : undefined
  if (!prev) return null
  const last = formatPriorHint(prev, isCardio)
  let suggestion: { direction: 'up' | 'down'; weight: number } | null = null
  if (!isCardio) {
    const fb = getRepRangeFeedback(
      row.target_reps,
      prev.reps_performed,
      prev.weight_performed
    )
    if (fb && fb.state !== 'on-target' && prev.weight_performed != null) {
      const weight = prev.weight_performed + fb.delta
      if (weight > 0) {
        suggestion = { direction: fb.delta > 0 ? 'up' : 'down', weight }
      }
    }
  }
  if (!last && !suggestion) return null
  return (
    <div className="flex items-center gap-2 text-[10px] px-3 pt-2 flex-wrap">
      {last && (
        <span className="text-subtle tabular-nums">
          Last: <span className="font-medium text-muted">{last}</span>
        </span>
      )}
      {suggestion && (
        <span
          className={`inline-flex items-center gap-1 font-medium border rounded-full px-2 py-0.5 tabular-nums ${
 suggestion.direction === 'up'
 ? 'text-indigo-fg bg-indigo-soft border-indigo-line '
 : 'text-amber-fg bg-amber-soft border-amber-line '
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

function PostSetHint({
  row,
  prior,
  loaded,
  isCardio,
  manuallyExpanded,
  onCollapse,
}: {
  row: RowState
  prior: PriorPerformance | undefined
  loaded: boolean
  isCardio: boolean
  manuallyExpanded: Set<number>
  onCollapse: (setNumber: number) => void
}) {
  const prev = loaded ? prior : undefined
  const improved = prev ? isImprovement(row, prev, isCardio) : false
  const showCollapse =
    loaded && row.completed && manuallyExpanded.has(row.set_number)
  if (!improved && !showCollapse) return null
  return (
    <div className="flex items-center justify-end gap-2 text-[10px] px-3 pb-1.5 flex-wrap">
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

export function ExerciseSetLogger({
  clientId,
  assignmentId,
  exercise,
  loggedDate,
  currentVariant = null,
}: ExerciseSetLoggerProps) {
  const supabase = useSupabase()
  const restTimer = useRestTimer()
  const [rows, setRows] = useState<RowState[]>(() => buildInitialRows(exercise))
  // Set numbers the user manually re-expanded after auto-collapse fired. Reset
  // on every load and per-toggle so a fresh "complete" always auto-collapses.
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<number>>(new Set())
  const isCardio = exercise.exercise_type === 'cardio'
  // Persisted rows for this scope come from the TanStack Query cache —
  // the Today mini-logger and the SupersetLogger patch the same key, so
  // changes flow back here without a re-fetch.
  const setLogsQuery = useExerciseSetLogs(
    assignmentId,
    exercise.id ?? '',
    loggedDate,
    { enabled: !!exercise.id }
  )
  const persistedRows = setLogsQuery.data ?? EMPTY_SET_LOGS
  const loaded = setLogsQuery.isSuccess
  const saveSetLog = useSaveSetLog()

  // Prior-performance ghost hint. Fetched via TanStack so it benefits
  // from the same cache + offline fallback as everything else; the
  // variant string is part of the key so swaps get their own cached
  // priors.
  const priorQuery = useQuery({
    queryKey: queryKeys.priorPerformance.forExercise(
      assignmentId,
      exercise.id ?? '',
      loggedDate,
      currentVariant
    ),
    enabled: !!exercise.id,
    queryFn: () =>
      fetchPriorPerformance(
        supabase,
        assignmentId,
        exercise.id!,
        loggedDate,
        currentVariant
      ),
  })
  // Stable Map identity so the prefill effect's deps don't churn every
  // render. The empty-fallback Map is built once and reused across all
  // pre-data renders, and once data lands it follows the query cache's
  // own reference equality.
  const priorBySet = useMemo(
    () => priorQuery.data ?? new Map<number, PriorPerformance>(),
    [priorQuery.data]
  )

  // Reset draft inputs when the scope changes. This is the legitimate
  // "mirror server-derived state into a mutable draft" pattern — the
  // local state owns mid-edit input strings which can't live in the
  // query cache. The React-19 lint rule's general advice doesn't apply.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRows(buildInitialRows(exercise))
    setManuallyExpanded(new Set())
  }, [assignmentId, exercise, loggedDate, currentVariant])

  // Merge the query's persisted rows into local `rows` state whenever
  // they change. Local state still owns the in-flight input strings so
  // the user's keystrokes between persists aren't lost — we only stamp
  // a row from the cache when there's an actual persisted row for it.
  useEffect(() => {
    setRows(prev =>
      prev.map(r => {
        const log = persistedRows.get(r.set_number)
        if (!log) return r
        const performedSeconds = log.duration_performed_seconds ?? null
        return {
          ...r,
          reps_performed: log.reps_performed != null ? String(log.reps_performed) : '',
          weight_performed:
            log.weight_performed != null ? String(log.weight_performed) : '',
          duration_input:
            performedSeconds != null ? formatDuration(performedSeconds) : '',
          duration_performed_seconds: performedSeconds,
          speed_performed:
            log.speed_performed != null ? String(log.speed_performed) : '',
          incline_performed:
            log.incline_performed != null ? String(log.incline_performed) : '',
          resistance_performed:
            log.resistance_performed != null
              ? String(log.resistance_performed)
              : '',
          completed: !!log.completed,
        }
      })
    )
  }, [persistedRows])

  // Prefill empty inputs from last session's actuals. Fires whenever
  // prior performance data arrives, but only patches a row that has:
  //   • no persisted log for today (today already wins via the merge
  //     effect above), AND
  //   • no in-flight values the user has typed (so we never clobber)
  // The Strong / Hevy pattern — your last-week's weight & reps are the
  // single most likely values for today's set, so one tap of the
  // checkmark completes the row without retyping.
  useEffect(() => {
    if (priorBySet.size === 0) return
    setRows(prev =>
      prev.map(r => {
        const todaysLog = persistedRows.get(r.set_number)
        if (todaysLog) return r
        if (
          r.reps_performed ||
          r.weight_performed ||
          r.duration_input ||
          r.speed_performed ||
          r.incline_performed ||
          r.resistance_performed
        ) {
          return r
        }
        const prior = priorBySet.get(r.set_number)
        if (!prior) return r
        return {
          ...r,
          reps_performed:
            prior.reps_performed != null ? String(prior.reps_performed) : '',
          weight_performed:
            prior.weight_performed != null ? String(prior.weight_performed) : '',
          duration_performed_seconds: prior.duration_performed_seconds,
          duration_input:
            prior.duration_performed_seconds != null
              ? formatDuration(prior.duration_performed_seconds)
              : '',
        }
      })
    )
  }, [priorBySet, persistedRows])
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateRow = (setNumber: number, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => (r.set_number === setNumber ? { ...r, ...patch } : r)))
  }

  const persist = async (row: RowState) => {
    if (!exercise.id) return
    const reps = row.reps_performed === '' ? null : parseFloat(row.reps_performed)
    const weight = row.weight_performed === '' ? null : parseFloat(row.weight_performed)
    const speed = row.speed_performed === '' ? null : parseFloat(row.speed_performed)
    const incline = row.incline_performed === '' ? null : parseFloat(row.incline_performed)
    const resistance =
      row.resistance_performed === '' ? null : parseFloat(row.resistance_performed)
    const persisted: SetLogRow = {
      set_number: row.set_number,
      reps_performed: Number.isNaN(reps as number) ? null : reps,
      weight_performed: Number.isNaN(weight as number) ? null : weight,
      duration_performed_seconds: row.duration_performed_seconds,
      speed_performed: Number.isNaN(speed as number) ? null : speed,
      incline_performed: Number.isNaN(incline as number) ? null : incline,
      resistance_performed: Number.isNaN(resistance as number) ? null : resistance,
      completed: row.completed,
    }
    // The mutation's onMutate patches both the per-exercise query (which
    // this view reads) AND the Today day-summary in one shot, with
    // automatic rollback on real error. Network errors keep the
    // mutation in TanStack's cache and resume when the persister
    // rehydrates on next mount.
    try {
      await saveSetLog.mutateAsync({
        assignmentId,
        exerciseId: exercise.id,
        date: loggedDate,
        clientId,
        row: persisted,
      })
    } catch {
      showToast('Failed to save set', 'error')
    }
  }

  // Parses the typed input ("20:30", "30", "1h 20m") into seconds and
  // normalizes the visible text to the canonical "20:30" form on blur.
  // For an already-completed (= already-saved) row this also persists
  // the new value, since the user is editing a row that's in the DB.
  // For an unchecked row it stays local — that's how we prevent phantom
  // rows on future-date views.
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
    if (next.completed) persist(next)
  }

  const toggleComplete = async (setNumber: number) => {
    const row = rows.find(r => r.set_number === setNumber)
    if (!row) return
    const next = { ...row, completed: !row.completed }
    updateRow(setNumber, { completed: next.completed })
    // Each completion cycle starts fresh — re-completing after editing should
    // auto-collapse again, even if the user previously tapped to re-expand.
    setManuallyExpanded(prev => {
      if (!prev.has(setNumber)) return prev
      const out = new Set(prev)
      out.delete(setNumber)
      return out
    })
    // Marking a set complete kicks off the rest countdown. Skip on un-toggle
    // and skip cardio (no inter-set rest concept) and skip when no rest is set.
    if (next.completed && !isCardio && exercise.rest_seconds && exercise.rest_seconds > 0) {
      restTimer.start(exercise.rest_seconds, exercise.name)
    }
    await persist(next)

    // Prefill the next set's local state from what we just persisted —
    // straight sets almost always repeat at the same weight/reps, so a
    // pre-populated row turns the next completion into a single tap.
    // Only fires on forward completion (uncomplete → complete) and only
    // when the next row is still untouched, so we never clobber values
    // the user already typed (or a set they explicitly cleared after
    // looking at it).
    if (next.completed) {
      const nextRow = rows.find(r => r.set_number === setNumber + 1)
      if (nextRow) {
        const isEmpty = isCardio
          ? !nextRow.duration_input &&
            nextRow.duration_performed_seconds == null &&
            !nextRow.speed_performed &&
            !nextRow.incline_performed &&
            !nextRow.resistance_performed
          : !nextRow.weight_performed && !nextRow.reps_performed
        if (isEmpty) {
          if (isCardio) {
            updateRow(setNumber + 1, {
              speed_performed: next.speed_performed,
              incline_performed: next.incline_performed,
              resistance_performed: next.resistance_performed,
              duration_performed_seconds: next.duration_performed_seconds,
              duration_input:
                next.duration_performed_seconds != null
                  ? formatDuration(next.duration_performed_seconds)
                  : '',
            })
          } else {
            updateRow(setNumber + 1, {
              weight_performed: next.weight_performed,
              reps_performed: next.reps_performed,
            })
          }
        }
      }
    }
  }

  // Re-expand a row that auto-collapsed after completion (without unchecking).
  const expandRow = (setNumber: number) => {
    setManuallyExpanded(prev => {
      if (prev.has(setNumber)) return prev
      const out = new Set(prev)
      out.add(setNumber)
      return out
    })
  }

  // Re-collapse a row the user previously tapped to expand. Lets the trainee
  // tidy back up after editing without having to uncheck-then-recheck Done.
  const collapseRow = (setNumber: number) => {
    setManuallyExpanded(prev => {
      if (!prev.has(setNumber)) return prev
      const out = new Set(prev)
      out.delete(setNumber)
      return out
    })
  }

  if (rows.length === 0) {
    return <p className="text-xs text-subtle italic mt-2">No sets prescribed.</p>
  }

  // Inline component rendering the ghost "Last week" hint, an "improved" pill
  // when the user beats their previous values, and (when applicable) a
  // Pre-set context strip: "Last: 135 × 6  ·  ↓ Try 130 lb". The
  // suggested-weight chip is the actionable bit — the trainee sees it
  // BEFORE the set so they can adjust load now, not "remember next time".
  // Strength only; cardio falls back to a plain "Last: 25:30" line.
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
 : 'border-line text-transparent hover:border-subtle'
 }`}
      >
        <Check size={14} />
      </button>
    ) : (
      <div className="h-6 w-6 bg-line/70 rounded-md animate-pulse shrink-0" />
    )

  // True when a row should render as the auto-collapsed one-liner. Forced
  // expansion (after a tap) wins over completed-state.
  const isAutoCollapsed = (row: RowState) =>
    loaded && row.completed && !manuallyExpanded.has(row.set_number)

  // One-line summary for an auto-collapsed completed row. Click anywhere on
  // it to re-expand the full editing UI.
  const renderCollapsedRow = (row: RowState) => {
    const summary = isCardio
      ? row.duration_performed_seconds != null
        ? formatDuration(row.duration_performed_seconds)
        : '—'
      : (() => {
          const w = row.weight_performed
          const r = row.reps_performed
          if (w !== '' && r !== '') return `${w} × ${r}`
          if (r !== '') return `${r} reps`
          if (w !== '') return `${w}`
          return '—'
        })()
    return (
      <button
        key={row.set_number}
        type="button"
        onClick={() => expandRow(row.set_number)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left bg-emerald-wash hover:bg-emerald-soft transition-colors cursor-pointer"
        aria-expanded={false}
        aria-label={`Expand set ${row.set_number}`}
      >
        <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
          {isCardio && rows.length === 1 ? '' : `Set ${row.set_number}`}
        </span>
        <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-500 text-white shrink-0">
          <Check size={11} />
        </span>
        <span className="text-sm text-muted tabular-nums truncate flex-1 min-w-0">
          {summary}
        </span>
        {/* "Tap to edit" hint is desktop-only — on phones the whole row is
            already an obvious tap target and the label was eating the room
            a long summary (e.g. 1234 × 100) needs. */}
        <span className="hidden sm:inline text-[10px] text-subtle shrink-0">
          Tap to edit
        </span>
      </button>
    )
  }

  if (isCardio) {
    const cardioFields = getCardioFields(
      exercise.cardio_subtype as CardioSubtype | null | undefined
    )
    const hasMachineFields =
      cardioFields.speed || cardioFields.incline || cardioFields.resistance
    return (
      <div className="mt-3 bg-surface rounded-lg border border-line overflow-hidden">
        {/* Desktop column header — hidden on phones since the row already labels itself. */}
        <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-subtle px-3 py-2 bg-amber-wash border-b border-amber-line">
          <div className="col-span-1 text-center">{rows.length > 1 ? '#' : ''}</div>
          <div className="col-span-4">Target</div>
          <div className="col-span-6">Time</div>
          <div className="col-span-1 text-center">Done</div>
        </div>
        <div className="divide-y divide-line-subtle">
          {rows.map(row => {
            if (isAutoCollapsed(row)) return renderCollapsedRow(row)
            const targetLabel =
              row.target_duration_seconds != null && row.target_duration_seconds > 0
                ? formatDuration(row.target_duration_seconds)
                : null
            // Build a "Speed 3-4 · Incline 15" string from the prescription
            // so the trainee sees what the coach asked for on the row itself.
            const machineTargetBits: string[] = []
            if (cardioFields.speed && row.target_speed)
              machineTargetBits.push(`Speed ${row.target_speed}`)
            if (cardioFields.incline && row.target_incline)
              machineTargetBits.push(`Incline ${row.target_incline}%`)
            if (cardioFields.resistance && row.target_resistance)
              machineTargetBits.push(`Resistance ${row.target_resistance}`)
            const machineTargetLabel = machineTargetBits.join(' · ')
            return (
              <div
                key={row.set_number}
                className={`transition-colors ${row.completed ? 'bg-emerald-wash' : ''}`}
              >
                <PreSetHint
                  row={row}
                  prior={priorBySet.get(row.set_number)}
                  loaded={loaded}
                  isCardio={isCardio}
                />
                <div className="px-3 py-2 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center">
                  {/* Mobile metadata row + done button. */}
                  <div className="flex items-center justify-between gap-2 mb-2 sm:hidden">
                    <span className="text-xs font-semibold text-foreground">
                      {rows.length > 1 && (
                        <span className="tabular-nums">Round {row.set_number}</span>
                      )}
                      {rows.length > 1 && targetLabel && (
                        <span className="text-subtle font-normal"> · </span>
                      )}
                      {targetLabel ? (
                        <span className="font-normal text-muted">
                          target <span className="text-foreground font-medium tabular-nums">{targetLabel}</span>
                        </span>
                      ) : !rows.length || rows.length === 1 ? (
                        <span className="text-subtle italic">—</span>
                      ) : null}
                    </span>
                    {renderDone(row)}
                  </div>

                  {/* Desktop-only set + target columns. */}
                  <div className="hidden sm:block sm:col-span-1 text-center text-sm font-semibold text-foreground tabular-nums">
                    {rows.length > 1 ? row.set_number : ''}
                  </div>
                  <div className="hidden sm:block sm:col-span-4 text-xs text-muted truncate">
                    {targetLabel ? (
                      <span className="font-medium tabular-nums">{targetLabel}</span>
                    ) : (
                      <span className="italic text-subtle">—</span>
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
                      <div className="h-8.5 w-full bg-line/70 rounded-lg animate-pulse" />
                    )}
                  </div>

                  {/* Desktop-only done column. */}
                  <div className="hidden sm:col-span-1 sm:flex sm:justify-center">
                    {renderDone(row)}
                  </div>
                </div>

                {/* Machine-specific actuals (speed / incline / resistance).
                    Only rendered when the exercise has a cardio_subtype set
                    AND the coach prescribed at least one of those fields. */}
                {hasMachineFields && (
                  <div className="px-3 pb-3 -mt-1">
                    {machineTargetLabel && (
                      <p className="text-[10px] text-subtle mb-1.5">
                        Target: <span className="text-muted">{machineTargetLabel}</span>
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {cardioFields.speed && (
                        <div>
                          <label className="block text-[10px] text-muted mb-0.5">Speed</label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={row.speed_performed}
                            onChange={e =>
                              updateRow(row.set_number, { speed_performed: e.target.value })
                            }
                            onBlur={() => {
                              const current = rows.find(r => r.set_number === row.set_number)
                              if (current?.completed) persist(current)
                            }}
                            placeholder="0"
                            className="text-sm py-1.5"
                          />
                        </div>
                      )}
                      {cardioFields.incline && (
                        <div>
                          <label className="block text-[10px] text-muted mb-0.5">Incline %</label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={row.incline_performed}
                            onChange={e =>
                              updateRow(row.set_number, { incline_performed: e.target.value })
                            }
                            onBlur={() => {
                              const current = rows.find(r => r.set_number === row.set_number)
                              if (current?.completed) persist(current)
                            }}
                            placeholder="0"
                            className="text-sm py-1.5"
                          />
                        </div>
                      )}
                      {cardioFields.resistance && (
                        <div>
                          <label className="block text-[10px] text-muted mb-0.5">Resistance</label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={row.resistance_performed}
                            onChange={e =>
                              updateRow(row.set_number, { resistance_performed: e.target.value })
                            }
                            onBlur={() => {
                              const current = rows.find(r => r.set_number === row.set_number)
                              if (current?.completed) persist(current)
                            }}
                            placeholder="0"
                            className="text-sm py-1.5"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <PostSetHint
                  row={row}
                  prior={priorBySet.get(row.set_number)}
                  loaded={loaded}
                  isCardio={isCardio}
                  manuallyExpanded={manuallyExpanded}
                  onCollapse={collapseRow}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 bg-surface rounded-lg border border-line overflow-hidden">
      {/* Desktop-only column header — phones use the per-row mobile header instead. */}
      <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-subtle px-3 py-2 bg-elevated border-b border-line">
        <div className="col-span-1 text-center">Set</div>
        <div className="col-span-2">Target</div>
        <div className="col-span-4">Weight</div>
        <div className="col-span-4">Reps</div>
        <div className="col-span-1 text-center">Done</div>
      </div>

      <div className="divide-y divide-line-subtle">
        {rows.map(row => {
          if (isAutoCollapsed(row)) return renderCollapsedRow(row)
          return (
          <div
            key={row.set_number}
            className={`transition-colors ${row.completed ? 'bg-emerald-wash' : ''}`}
          >
            <PreSetHint
                  row={row}
                  prior={priorBySet.get(row.set_number)}
                  loaded={loaded}
                  isCardio={isCardio}
                />
            <div className="px-3 py-2 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center">
              {/* Mobile-only metadata row: set # + target + done. */}
              <div className="flex items-center justify-between gap-2 mb-2 sm:hidden">
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  Set {row.set_number}
                  {row.target_reps && (
                    <span className="font-normal text-muted"> · target {row.target_reps}</span>
                  )}
                </span>
                {renderDone(row)}
              </div>

              {/* Desktop columns 1–2. */}
              <div className="hidden sm:block sm:col-span-1 text-center text-sm font-semibold text-foreground tabular-nums">
                {row.set_number}
              </div>
              <div className="hidden sm:block sm:col-span-2 text-xs text-muted truncate">
                {row.target_reps || <span className="italic text-subtle">—</span>}
              </div>

              {/* Inputs — two-up grid on mobile, columns 3–4 on desktop. `sm:contents`
                  collapses the wrapper at >=sm so each Input becomes a direct child of
                  the parent grid. Weight comes first (lift first, then count reps). */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <div className="sm:col-span-4">
                  {loaded ? (
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      value={row.weight_performed}
                      onChange={e => updateRow(row.set_number, { weight_performed: e.target.value })}
                      onBlur={() => {
                        // Only persist on blur when the row is already
                        // a saved set — editing weight/reps on a still-
                        // unchecked set holds in local state, so a user
                        // who accidentally tabs through a future-date
                        // logger never writes phantom rows.
                        const current = rows.find(r => r.set_number === row.set_number)
                        if (current?.completed) persist(current)
                      }}
                      placeholder="weight"
                      className="text-sm py-1.5"
                    />
                  ) : (
                    <div className="h-8.5 w-full bg-line/70 rounded-lg animate-pulse" />
                  )}
                </div>
                <div className="sm:col-span-4">
                  {loaded ? (
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      value={row.reps_performed}
                      onChange={e => updateRow(row.set_number, { reps_performed: e.target.value })}
                      onBlur={() => {
                        const current = rows.find(r => r.set_number === row.set_number)
                        if (current?.completed) persist(current)
                      }}
                      placeholder="reps"
                      className="text-sm py-1.5"
                    />
                  ) : (
                    <div className="h-8.5 w-full bg-line/70 rounded-lg animate-pulse" />
                  )}
                </div>
              </div>

              {/* Desktop-only done column. */}
              <div className="hidden sm:col-span-1 sm:flex sm:justify-center">
                {renderDone(row)}
              </div>
            </div>
            <PostSetHint
                  row={row}
                  prior={priorBySet.get(row.set_number)}
                  loaded={loaded}
                  isCardio={isCardio}
                  manuallyExpanded={manuallyExpanded}
                  onCollapse={collapseRow}
                />
          </div>
          )
        })}
      </div>
    </div>
  )
}
