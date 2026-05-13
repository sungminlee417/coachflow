'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Check, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react'
import { formatDuration, parseDuration } from '@/lib/utils'
import { queuedUpsert } from '@/lib/write-queue'
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

interface ExerciseSetLoggerProps {
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
  saving?: boolean
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

export function ExerciseSetLogger({
  assignmentId,
  exercise,
  loggedDate,
  currentVariant = null,
}: ExerciseSetLoggerProps) {
  const supabase = useSupabase()
  const restTimer = useRestTimer()
  const [rows, setRows] = useState<RowState[]>(() => buildInitialRows(exercise))
  const [loaded, setLoaded] = useState(false)
  const [priorBySet, setPriorBySet] = useState<Map<number, PriorPerformance>>(new Map())
  // Set numbers the user manually re-expanded after auto-collapse fired. Reset
  // on every load and per-toggle so a fresh "complete" always auto-collapses.
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<number>>(new Set())
  const isCardio = exercise.exercise_type === 'cardio'

  useEffect(() => {
    let cancelled = false
    setRows(buildInitialRows(exercise))
    setLoaded(false)
    setPriorBySet(new Map())
    setManuallyExpanded(new Set())

    const load = async () => {
      // Today's logs (the values to populate the inputs) and prior performance
      // (the ghost hint) can fly in parallel — they don't depend on each other.
      const [todayResult, prior] = await Promise.all([
        supabase
          .from('set_logs')
          .select(
            'set_number, reps_performed, weight_performed, duration_performed_seconds, speed_performed, incline_performed, resistance_performed, completed'
          )
          .eq('assignment_id', assignmentId)
          .eq('exercise_id', exercise.id ?? '')
          .eq('logged_date', loggedDate),
        exercise.id
          ? fetchPriorPerformance(
              supabase,
              assignmentId,
              exercise.id,
              loggedDate,
              currentVariant
            )
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
            speed_performed: log.speed_performed != null ? String(log.speed_performed) : '',
            incline_performed: log.incline_performed != null ? String(log.incline_performed) : '',
            resistance_performed: log.resistance_performed != null ? String(log.resistance_performed) : '',
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
  }, [assignmentId, exercise.id, loggedDate, currentVariant])

  const updateRow = (setNumber: number, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => (r.set_number === setNumber ? { ...r, ...patch } : r)))
  }

  const persist = async (row: RowState) => {
    if (!exercise.id) return
    updateRow(row.set_number, { saving: true })
    const reps = row.reps_performed === '' ? null : parseFloat(row.reps_performed)
    const weight = row.weight_performed === '' ? null : parseFloat(row.weight_performed)
    const speed = row.speed_performed === '' ? null : parseFloat(row.speed_performed)
    const incline = row.incline_performed === '' ? null : parseFloat(row.incline_performed)
    const resistance =
      row.resistance_performed === '' ? null : parseFloat(row.resistance_performed)
    const { error } = await queuedUpsert(
      supabase,
      'set_logs',
      {
        assignment_id: assignmentId,
        exercise_id: exercise.id,
        set_number: row.set_number,
        logged_date: loggedDate,
        reps_performed: Number.isNaN(reps as number) ? null : reps,
        weight_performed: Number.isNaN(weight as number) ? null : weight,
        duration_performed_seconds: row.duration_performed_seconds,
        speed_performed: Number.isNaN(speed as number) ? null : speed,
        incline_performed: Number.isNaN(incline as number) ? null : incline,
        resistance_performed: Number.isNaN(resistance as number) ? null : resistance,
        completed: row.completed,
      },
      { onConflict: 'assignment_id,exercise_id,set_number,logged_date' }
    )
    if (error) showToast('Failed to save set', 'error')
    updateRow(row.set_number, { saving: false })
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
    return <p className="text-xs text-slate-400 italic mt-2">No sets prescribed.</p>
  }

  // Inline component rendering the ghost "Last week" hint, an "improved" pill
  // when the user beats their previous values, and (when applicable) a
  // Pre-set context strip: "Last: 135 × 6  ·  ↓ Try 130 lb". The
  // suggested-weight chip is the actionable bit — the trainee sees it
  // BEFORE the set so they can adjust load now, not "remember next time".
  // Strength only; cardio falls back to a plain "Last: 25:30" line.
  const PreSetHint = ({ row }: { row: RowState }) => {
    const prev = loaded ? priorBySet.get(row.set_number) : undefined
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
          <span className="text-slate-400 tabular-nums">
            Last: <span className="font-medium text-slate-500">{last}</span>
          </span>
        )}
        {suggestion && (
          <span
            className={`inline-flex items-center gap-1 font-medium border rounded-full px-2 py-0.5 tabular-nums ${
              suggestion.direction === 'up'
                ? 'text-indigo-700 bg-indigo-50 border-indigo-100'
                : 'text-amber-700 bg-amber-50 border-amber-100'
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

  // Post-set strip: "↑ Beat last" celebration + collapse link. Pre-set
  // context has already shown the trainee what to aim for, so we keep
  // this row small and reactive — only renders when there's something to
  // surface.
  const PostSetHint = ({ row }: { row: RowState }) => {
    const prev = loaded ? priorBySet.get(row.set_number) : undefined
    const improved = prev ? isImprovement(row, prev, isCardio) : false
    const showCollapse =
      loaded && row.completed && manuallyExpanded.has(row.set_number)
    if (!improved && !showCollapse) return null
    return (
      <div className="flex items-center justify-end gap-2 text-[10px] px-3 pb-1.5 flex-wrap">
        {improved && (
          <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-px font-semibold tabular-nums">
            ↑ Beat last
          </span>
        )}
        {showCollapse && (
          <button
            type="button"
            onClick={() => collapseRow(row.set_number)}
            className="inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Collapse this set"
          >
            <ChevronUp size={11} />
            Collapse
          </button>
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
        className="w-full px-3 py-2 flex items-center gap-2 text-left bg-emerald-50/40 hover:bg-emerald-50 transition-colors cursor-pointer"
        aria-expanded={false}
        aria-label={`Expand set ${row.set_number}`}
      >
        <span className="text-sm font-semibold text-slate-700 tabular-nums">
          {isCardio && rows.length === 1 ? '' : `Set ${row.set_number}`}
        </span>
        <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-emerald-500 text-white shrink-0">
          <Check size={11} />
        </span>
        <span className="text-sm text-slate-600 tabular-nums truncate flex-1">
          {summary}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">Tap to edit</span>
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
                className={`transition-colors ${row.completed ? 'bg-emerald-50/40' : ''}`}
              >
                <PreSetHint row={row} />
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

                {/* Machine-specific actuals (speed / incline / resistance).
                    Only rendered when the exercise has a cardio_subtype set
                    AND the coach prescribed at least one of those fields. */}
                {hasMachineFields && (
                  <div className="px-3 pb-3 -mt-1">
                    {machineTargetLabel && (
                      <p className="text-[10px] text-slate-400 mb-1.5">
                        Target: <span className="text-slate-600">{machineTargetLabel}</span>
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {cardioFields.speed && (
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Speed</label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={row.speed_performed}
                            onChange={e =>
                              updateRow(row.set_number, { speed_performed: e.target.value })
                            }
                            onBlur={() =>
                              persist(rows.find(r => r.set_number === row.set_number)!)
                            }
                            placeholder="0"
                            className="text-sm py-1.5"
                          />
                        </div>
                      )}
                      {cardioFields.incline && (
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Incline %</label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={row.incline_performed}
                            onChange={e =>
                              updateRow(row.set_number, { incline_performed: e.target.value })
                            }
                            onBlur={() =>
                              persist(rows.find(r => r.set_number === row.set_number)!)
                            }
                            placeholder="0"
                            className="text-sm py-1.5"
                          />
                        </div>
                      )}
                      {cardioFields.resistance && (
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">Resistance</label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            inputMode="decimal"
                            value={row.resistance_performed}
                            onChange={e =>
                              updateRow(row.set_number, { resistance_performed: e.target.value })
                            }
                            onBlur={() =>
                              persist(rows.find(r => r.set_number === row.set_number)!)
                            }
                            placeholder="0"
                            className="text-sm py-1.5"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <PostSetHint row={row} />
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
        <div className="col-span-4">Weight</div>
        <div className="col-span-4">Reps</div>
        <div className="col-span-1 text-center">Done</div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map(row => {
          if (isAutoCollapsed(row)) return renderCollapsedRow(row)
          return (
          <div
            key={row.set_number}
            className={`transition-colors ${row.completed ? 'bg-emerald-50/40' : ''}`}
          >
            <PreSetHint row={row} />
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
                      onBlur={() => persist(rows.find(r => r.set_number === row.set_number)!)}
                      placeholder="weight"
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
              </div>

              {/* Desktop-only done column. */}
              <div className="hidden sm:col-span-1 sm:flex sm:justify-center">
                {renderDone(row)}
              </div>
            </div>
            <PostSetHint row={row} />
          </div>
          )
        })}
      </div>
    </div>
  )
}
