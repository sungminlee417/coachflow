'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Dumbbell } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import {
  useDaySetLogs,
  useSaveSetLog,
  type DaySetLogRow,
  type SetLogRow,
} from '@/lib/hooks/use-set-logs'
import { useWorkoutAssignments } from '@/lib/hooks/use-assignments'
import { queryKeys } from '@/lib/query-keys'
import { formatDuration, parseDuration } from '@/lib/utils'
import { Card, CardEmpty, CardSkeletonBody, ProgressBar } from './primitives'

// Stable empty fallback so memo deps don't see a new Map identity on
// every render before the query resolves.
const EMPTY_DAY_SET_LOGS: Map<string, DaySetLogRow> = new Map()

export function WorkoutCard({
  clientId,
  loggedDate,
  onOpen,
}: {
  clientId: string
  loggedDate: string
  onOpen: () => void
}) {
  const assignmentsQuery = useWorkoutAssignments(clientId, loggedDate)
  const assignments = assignmentsQuery.data ?? null
  const loadingAssignments = assignmentsQuery.isLoading && !assignmentsQuery.isSuccess

  // Day-wide set_logs query shared with the deep logger via cache
  // updates the save mutation does in `onMutate`. The Today card just
  // derives its progress numbers from this; toggling completion in
  // any logger patches the same cache so this re-renders without
  // re-fetching.
  const assignmentIds = useMemo(
    () => (assignments ?? []).map(a => a.id),
    [assignments]
  )
  const setLogsQuery = useDaySetLogs({
    clientId,
    date: loggedDate,
    assignmentIds,
  })
  const daySetLogs: Map<string, DaySetLogRow> = setLogsQuery.data ?? EMPTY_DAY_SET_LOGS
  const loading = loadingAssignments || (assignmentIds.length > 0 && !setLogsQuery.isSuccess)

  // Derived: `exerciseId::setNumber` for every set marked completed today.
  const completedKeys = useMemo(() => {
    const out = new Set<string>()
    for (const [, row] of daySetLogs) {
      if (row.completed) out.add(`${row.exercise_id}::${row.set_number}`)
    }
    return out
  }, [daySetLogs])

  const summary = useMemo(() => {
    if (!assignments) return null
    let totalSets = 0
    let completedSets = 0
    let nextExercise: string | null = null
    // The "next set you should log". Supersets still need the deep view
    // (multi-exercise round logging), but cardio and strength both have
    // a single-row inline form here — `kind` tells the renderer which.
    let nextSet: {
      kind: 'strength' | 'cardio'
      assignmentId: string
      exerciseId: string
      exerciseName: string
      targetDurationSeconds: number | null
      setNumber: number
      totalSets: number
      targetReps: string
    } | null = null

    for (const a of assignments) {
      const exercises = a.workout.exercises ?? []
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i]
        const prescribed = ex.exercise_sets?.length ?? ex.sets ?? 0
        totalSets += prescribed
        let exDone = 0
        for (let n = 1; n <= prescribed; n++) {
          if (ex.id && completedKeys.has(`${ex.id}::${n}`)) exDone += 1
        }
        completedSets += exDone
        if (!nextExercise && exDone < prescribed) nextExercise = ex.name

        // Pick the first unfinished set on a plain strength exercise.
        // Skip supersets only — those still need the deep view because
        // each round logs multiple exercises at once. Cardio is fine
        // inline: a single duration field per interval is enough.
        const isCardio = ex.exercise_type === 'cardio'
        const isInSuperset = ex.pair_with_next || exercises[i - 1]?.pair_with_next
        if (!nextSet && ex.id && exDone < prescribed && !isInSuperset) {
          // Find the first set_number that isn't done.
          let target = 1
          for (let n = 1; n <= prescribed; n++) {
            if (!completedKeys.has(`${ex.id}::${n}`)) {
              target = n
              break
            }
          }
          const set = ex.exercise_sets?.[target - 1]
          const targetRepsStr = set?.target_reps ?? ex.reps ?? ''
          nextSet = {
            kind: isCardio ? 'cardio' : 'strength',
            assignmentId: a.id,
            exerciseId: ex.id,
            exerciseName: ex.name,
            setNumber: target,
            totalSets: prescribed,
            targetReps: targetRepsStr,
            targetDurationSeconds: set?.target_duration_seconds ?? null,
          }
        }
      }
    }
    return { totalSets, completedSets, nextExercise, nextSet }
  }, [assignments, completedKeys])

  return (
    <Card onClick={onOpen} accent="emerald" icon={Dumbbell} label="Workout">
      {loading ? (
        <CardSkeletonBody lines={2} />
      ) : !assignments || assignments.length === 0 ? (
        <CardEmpty
          icon={Dumbbell}
          title="Rest day"
          description="No workouts scheduled. Tap to assign one or check past sessions."
        />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900 truncate min-w-0">
              {assignments.map(a => a.workout.name).join(' · ')}
            </p>
            <p className="text-xs text-slate-500 shrink-0 tabular-nums">
              {summary?.completedSets ?? 0}/{summary?.totalSets ?? 0} sets
            </p>
          </div>
          {/* Coach note for today, if the coach left one on any of the
              active assignments. We concatenate when there are multiple
              workouts assigned today — rare but possible. */}
          {assignments
            .map(a => a.notes?.trim())
            .filter((n): n is string => !!n)
            .map((note, i) => (
              <p
                key={i}
                className="text-xs text-indigo-700 bg-indigo-50/60 border border-indigo-100 rounded-md px-2 py-1.5 italic"
              >
                <span className="font-semibold not-italic">Coach:</span> {note}
              </p>
            ))}
          <ProgressBar
            value={summary?.completedSets ?? 0}
            total={summary?.totalSets ?? 0}
            tone="emerald"
          />
          {summary?.nextSet ? (
            <NextSetMiniLogger
              // Remount on advance — fresh empty inputs for the new set.
              // The new `key` changes automatically once the mutation's
              // cache patch flips `completedKeys` and `summary.nextSet`
              // points at the next unfinished set.
              key={`${summary.nextSet.exerciseId}::${summary.nextSet.setNumber}`}
              clientId={clientId}
              kind={summary.nextSet.kind}
              assignmentId={summary.nextSet.assignmentId}
              exerciseId={summary.nextSet.exerciseId}
              exerciseName={summary.nextSet.exerciseName}
              setNumber={summary.nextSet.setNumber}
              totalSets={summary.nextSet.totalSets}
              targetReps={summary.nextSet.targetReps}
              targetDurationSeconds={summary.nextSet.targetDurationSeconds}
              loggedDate={loggedDate}
            />
          ) : summary?.nextExercise ? (
            // The next thing to do is a cardio exercise or superset
            // round, which the inline mini-logger doesn't handle. Point
            // the user at the full view via the Open button.
            <p className="text-xs text-slate-500 truncate">
              Next:{' '}
              <span className="font-medium text-slate-700">{summary.nextExercise}</span>
              <span className="ml-1 text-slate-400">— open to log</span>
            </p>
          ) : null}
          {summary && summary.totalSets > 0 && summary.completedSets >= summary.totalSets && (
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
              <Check size={12} /> Done for the day
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

// Compact "log the next set" form rendered inline in the Workout card.
// Only fires for plain strength exercises — supersets and cardio still
// require the full ClientWorkoutView (open via the corner Open button).
// Patches the shared set-logs store on success; the parent's
// `completedKeys` re-derives off the store and its `key={...}` on this
// component changes, which remounts with fresh empty inputs.
function NextSetMiniLogger({
  clientId,
  kind,
  assignmentId,
  exerciseId,
  exerciseName,
  setNumber,
  totalSets,
  targetReps,
  targetDurationSeconds,
  loggedDate,
}: {
  clientId: string
  kind: 'strength' | 'cardio'
  assignmentId: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  totalSets: number
  targetReps: string
  targetDurationSeconds: number | null
  loggedDate: string
}) {
  const qc = useQueryClient()
  const saveSetLog = useSaveSetLog()
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  // Cardio path uses a single duration field — accepts the same loose
  // formats as the deep cardio logger ("20:30", "30", "1h 20m").
  const [duration, setDuration] = useState('')
  const saving = saveSetLog.isPending

  const handleLog = async () => {
    // Read any existing per-exercise cache so we don't clobber machine
    // columns that the deep ExerciseSetLogger has populated.
    const exerciseRows =
      qc.getQueryData<Map<number, SetLogRow>>(
        queryKeys.setLogs.forExercise(assignmentId, exerciseId, loggedDate)
      ) ?? new Map<number, SetLogRow>()
    const existing = exerciseRows.get(setNumber)

    if (kind === 'strength') {
      const w = weight === '' ? null : parseFloat(weight)
      const r = reps === '' ? null : parseFloat(reps)
      if (r == null || !Number.isFinite(r) || r <= 0) {
        showToast('Enter reps to log this set', 'error')
        return
      }
      const persisted: SetLogRow = {
        set_number: setNumber,
        reps_performed: r,
        weight_performed: w != null && Number.isFinite(w) ? w : null,
        duration_performed_seconds: null,
        speed_performed: existing?.speed_performed ?? null,
        incline_performed: existing?.incline_performed ?? null,
        resistance_performed: existing?.resistance_performed ?? null,
        completed: true,
      }
      try {
        await saveSetLog.mutateAsync({
          assignmentId,
          exerciseId,
          date: loggedDate,
          clientId,
          row: persisted,
        })
      } catch {
        showToast('Failed to log set', 'error')
      }
      return
    }
    // Cardio path: persist duration_performed_seconds. Speed/incline/
    // resistance are intentionally not collected here — they live in
    // the deep view's per-machine UI.
    const parsedSeconds = parseDuration(duration)
    if (parsedSeconds == null || parsedSeconds <= 0) {
      showToast('Enter a duration (e.g. 20 or 20:30)', 'error')
      return
    }
    const persisted: SetLogRow = {
      set_number: setNumber,
      reps_performed: null,
      weight_performed: null,
      duration_performed_seconds: parsedSeconds,
      speed_performed: existing?.speed_performed ?? null,
      incline_performed: existing?.incline_performed ?? null,
      resistance_performed: existing?.resistance_performed ?? null,
      completed: true,
    }
    try {
      await saveSetLog.mutateAsync({
        assignmentId,
        exerciseId,
        date: loggedDate,
        clientId,
        row: persisted,
      })
    } catch {
      showToast('Failed to log set', 'error')
    }
  }

  const isCardio = kind === 'cardio'
  const cardioTargetLabel =
    isCardio && targetDurationSeconds != null && targetDurationSeconds > 0
      ? formatDuration(targetDurationSeconds)
      : null

  return (
    <div
      className={`rounded-xl border p-2.5 mt-1 ${
        isCardio
          ? 'bg-amber-50/40 border-amber-100'
          : 'bg-emerald-50/40 border-emerald-100'
      }`}
    >
      <p className="text-[11px] text-slate-600 truncate">
        <span className="font-semibold text-slate-900">{exerciseName}</span>
        <span className="text-slate-400">
          {' · '}
          {isCardio
            ? totalSets > 1
              ? `Interval ${setNumber}/${totalSets}`
              : 'Duration'
            : `Set ${setNumber}/${totalSets}`}
          {!isCardio && targetReps && (
            <>
              {' · '}target{' '}
              <span className="font-medium text-slate-600">{targetReps}</span>
            </>
          )}
          {isCardio && cardioTargetLabel && (
            <>
              {' · '}target{' '}
              <span className="font-medium text-slate-600 tabular-nums">
                {cardioTargetLabel}
              </span>
            </>
          )}
        </span>
      </p>
      <form
        onSubmit={e => {
          // Native `<form>` so Enter on any input fires `handleLog` —
          // common reflex on mobile and desktop both.
          e.preventDefault()
          handleLog()
        }}
        className={`grid gap-2 mt-2 ${
          isCardio
            ? 'grid-cols-[1fr_auto]'
            : 'grid-cols-[1fr_1fr_auto]'
        }`}
      >
        {isCardio ? (
          <Input
            value={duration}
            onChange={e => setDuration(e.target.value)}
            placeholder="20:30 or 30"
            className="text-sm py-1.5"
          />
        ) : (
          <>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="weight"
              className="text-sm py-1.5"
            />
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={reps}
              onChange={e => setReps(e.target.value)}
              placeholder="reps"
              className="text-sm py-1.5"
            />
          </>
        )}
        <Button
          type="submit"
          size="sm"
          loading={saving}
          // Cardio uses `duration`; strength uses `reps`. Without this
          // branch the button stays disabled forever in the cardio flow.
          disabled={saving || (isCardio ? !duration : !reps)}
          aria-label="Log set"
        >
          <Check size={14} />
        </Button>
      </form>
    </div>
  )
}
