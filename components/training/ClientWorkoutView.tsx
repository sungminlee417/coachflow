'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { WeekSelector } from '@/components/ui/WeekSelector'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { ChevronDown, ChevronRight, HeartPulse, Trash2 } from 'lucide-react'
import { AssignmentCardSkeleton } from '@/components/ui/Skeleton'
import { formatDuration, todayISO, formatLongDate } from '@/lib/utils'
import { useWorkoutAssignments } from '@/lib/hooks/use-assignments'
import { useDaySetLogs } from '@/lib/hooks/use-set-logs'
import { queryKeys } from '@/lib/query-keys'
import type { Exercise, WorkoutAssignment } from '@/lib/types'
import { ExerciseSetLogger } from './ExerciseSetLogger'
import { SubstitutionPicker } from './SubstitutionPicker'
import { SupersetLogger } from './SupersetLogger'

interface ClientWorkoutViewProps {
  clientId: string
}

interface ExerciseGroup {
  startIndex: number
  exercises: Exercise[]
}

// Walk an ordered exercise list and bundle consecutive exercises linked by
// `pair_with_next`. A "pair_with_next=true" on exercise N means N feeds into N+1.
function groupExercises(exercises: Exercise[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = []
  exercises.forEach((ex, i) => {
    const prev = exercises[i - 1]
    const continueGroup = !!prev?.pair_with_next
    const last = groups[groups.length - 1]
    if (continueGroup && last) {
      last.exercises.push(ex)
    } else {
      groups.push({ startIndex: i, exercises: [ex] })
    }
  })
  return groups
}

// Rough wall-clock estimate so the trainee can budget time before committing
// to the workout. Heuristics: 45s of work per strength set, the exercise's
// own target duration for cardio (falling back to 60s), and the exercise's
// rest_seconds between sets within an exercise (falling back to 60s).
// Intentionally not exact — the "~Xmin" label below sets the expectation.
function estimateWorkoutSeconds(exercises: Exercise[]): number {
  const STRENGTH_WORK_PER_SET = 45
  const CARDIO_WORK_DEFAULT = 60
  const REST_DEFAULT = 60
  let total = 0
  for (const ex of exercises) {
    const sets = ex.exercise_sets ?? []
    if (sets.length === 0) continue
    const isCardio = ex.exercise_type === 'cardio'
    for (const s of sets) {
      total += isCardio
        ? s.target_duration_seconds ?? CARDIO_WORK_DEFAULT
        : STRENGTH_WORK_PER_SET
    }
    total += (sets.length - 1) * (ex.rest_seconds ?? REST_DEFAULT)
  }
  return total
}

function formatEstimate(seconds: number): string {
  if (seconds < 60) return '<1 min'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `~${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`
}

const EMPTY_ASSIGNMENTS: WorkoutAssignment[] = []

export default function ClientWorkoutView({ clientId }: ClientWorkoutViewProps) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const assignmentsQuery = useWorkoutAssignments(clientId, selectedDate)
  const assignments = assignmentsQuery.data ?? EMPTY_ASSIGNMENTS
  const loading = assignmentsQuery.isLoading && !assignmentsQuery.isSuccess
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingUnassign, setPendingUnassign] = useState<{ id: string; name: string } | null>(null)
  // Per-exercise/per-superset collapse state. Keyed by `${assignment.id}::solo::${exId}`
  // for solos and `${assignment.id}::group::${gi}` for supersets so the same
  // exercise across two simultaneous assignments doesn't collide.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  // Active substitution per (assignment, exercise). Seeded from the fetched
  // exercise.substitution; mutated by the SubstitutionPicker's onChange.
  // null = original is in play; absent = not yet seeded.
  const [subOverrides, setSubOverrides] = useState<Map<string, string | null>>(new Map())

  const subKey = (assignmentId: string, exerciseId: string) =>
    `${assignmentId}::${exerciseId}`

  const toggleCollapsed = (key: string) => {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setActiveSub = (assignmentId: string, exerciseId: string, value: string | null) => {
    setSubOverrides(prev => {
      const next = new Map(prev)
      next.set(subKey(assignmentId, exerciseId), value)
      return next
    })
  }

  // Group exercises once per assignment instead of on every render of every
  // toggle (collapse, sub-swap, etc.). The visible assignment list re-renders
  // a lot; the per-assignment exercise array rarely changes between fetches.
  const groupsByAssignment = useMemo(() => {
    const map = new Map<string, ExerciseGroup[]>()
    for (const a of assignments) {
      map.set(a.id, groupExercises(a.workout.exercises ?? []))
    }
    return map
  }, [assignments])

  // Day-wide set logs — shared cache with the Today WorkoutCard. We read
  // this purely to detect the "last set of the day" transition and fire
  // the celebration toast below; the per-exercise loggers still own the
  // logging UI itself.
  const assignmentIds = useMemo(() => assignments.map(a => a.id), [assignments])
  const dayLogsQuery = useDaySetLogs({
    clientId,
    date: selectedDate,
    assignmentIds,
  })

  // Aggregate prescribed vs. completed across every visible assignment.
  // Volume + duration totals power the celebration toast copy.
  const dayProgress = useMemo(() => {
    let prescribedSets = 0
    let completedSets = 0
    let totalReps = 0
    let totalVolume = 0
    let totalDurationSeconds = 0
    const logs = dayLogsQuery.data
    for (const a of assignments) {
      for (const ex of a.workout.exercises ?? []) {
        const prescribed = ex.exercise_sets?.length ?? ex.sets ?? 0
        prescribedSets += prescribed
        if (!ex.id || !logs) continue
        for (let n = 1; n <= prescribed; n++) {
          const row = logs.get(`${a.id}::${ex.id}::${n}`)
          if (row?.completed) {
            completedSets += 1
            if (row.reps_performed != null) totalReps += row.reps_performed
            if (row.weight_performed != null && row.reps_performed != null) {
              totalVolume += row.weight_performed * row.reps_performed
            }
            if (row.duration_performed_seconds != null) {
              totalDurationSeconds += row.duration_performed_seconds
            }
          }
        }
      }
    }
    const isComplete = prescribedSets > 0 && completedSets >= prescribedSets
    return {
      prescribedSets,
      completedSets,
      totalReps,
      totalVolume,
      totalDurationSeconds,
      isComplete,
    }
  }, [assignments, dayLogsQuery.data])

  // Celebration trigger. We want to fire exactly once when the trainee
  // completes the final set of the day, but never on cold load of an
  // already-done workout (page reload, switching back to today). The
  // `userTouchedRef` flips true only when an exercise/superset reports
  // its own "all sets done" via the existing callback — i.e. the user
  // just clicked complete — so first-paint doesn't trip the toast.
  const userTouchedRef = useRef(false)
  const celebratedKeyRef = useRef<string | null>(null)
  const dayCompleteKey = `${selectedDate}::${dayProgress.prescribedSets}::${dayProgress.completedSets}`
  // Reset the "user touched" flag when the visible day changes so
  // switching to a different day's already-complete workout doesn't
  // immediately fire a toast.
  useEffect(() => {
    userTouchedRef.current = false
  }, [selectedDate])
  useEffect(() => {
    if (!dayProgress.isComplete) return
    if (!userTouchedRef.current) return
    if (celebratedKeyRef.current === dayCompleteKey) return
    celebratedKeyRef.current = dayCompleteKey
    const parts: string[] = [
      `${dayProgress.completedSets} set${dayProgress.completedSets === 1 ? '' : 's'}`,
    ]
    if (dayProgress.totalReps > 0) {
      parts.push(`${dayProgress.totalReps} reps`)
    }
    if (dayProgress.totalVolume > 0) {
      parts.push(`${Math.round(dayProgress.totalVolume).toLocaleString()} lb volume`)
    }
    if (dayProgress.totalDurationSeconds > 0) {
      parts.push(formatDuration(dayProgress.totalDurationSeconds))
    }
    showToast(`Workout complete · ${parts.join(' · ')}`, 'success')
  }, [
    dayCompleteKey,
    dayProgress.completedSets,
    dayProgress.isComplete,
    dayProgress.totalDurationSeconds,
    dayProgress.totalReps,
    dayProgress.totalVolume,
  ])

  const handleAnyAllSetsCompleted = (collapseKey: string) => {
    userTouchedRef.current = true
    setCollapsedKeys(prev => {
      if (prev.has(collapseKey)) return prev
      const next = new Set(prev)
      next.add(collapseKey)
      return next
    })
  }

  const handleUnassign = async () => {
    if (!pendingUnassign) return
    try {
      const { error } = await supabase
        .from('workout_assignments')
        .delete()
        .eq('id', pendingUnassign.id)
      if (error) throw error
      showToast('Workout removed')
      await fetchAssignments()
    } catch {
      showToast('Failed to remove workout', 'error')
    } finally {
      setPendingUnassign(null)
    }
  }

  const fetchAssignments = () =>
    qc.invalidateQueries({
      queryKey: queryKeys.workoutAssignments.forDay(clientId, selectedDate),
    })

  // Reseed the substitution overrides whenever the assignments refresh — this
  // includes the per-day swap pulled by queries.ts so the chips reflect the
  // server's truth on first paint and after every selectedDate change.
  useEffect(() => {
    const next = new Map<string, string | null>()
    for (const a of assignments) {
      for (const ex of a.workout.exercises ?? []) {
        if (ex.id) next.set(subKey(a.id, ex.id), ex.substitution ?? null)
      }
    }
    setSubOverrides(next)
  }, [assignments])

  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-4">My Workouts</h2>

      <WeekSelector selectedDate={selectedDate} onSelect={setSelectedDate} tone="brand" />

      <h3 className="text-lg font-semibold mb-4">{formatLongDate(selectedDate)}</h3>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <AssignmentCardSkeleton key={i} />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-elevated rounded-xl p-8 text-center">
          <p className="text-muted">No workouts assigned for this day</p>
          <p className="text-sm text-subtle mt-2">
            Check other days or assign yourself one from My Workouts
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map(assignment => {
            const isOwnAssignment = assignment.coach_id === clientId
            return (
            <div
              key={assignment.id}
              className="bg-surface rounded-xl border border-line"
            >
              {/* Sticky workout-name bar — keeps "Push Day" / "Pull Day" /
                  whatever visible while the trainee scrolls through the
                  exercises so they always know which workout they're in
                  the middle of. `top-14 md:top-0` clears the mobile top
                  nav; the card no longer uses `overflow-hidden` so sticky
                  can actually pin against the viewport instead of the
                  card's own box. */}
              <div className="sticky top-14 md:top-0 z-10 bg-surface rounded-t-xl px-6 pt-6 pb-3 flex items-start justify-between gap-3 border-b border-line-subtle">
                <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                  <h3 className="text-xl font-bold text-foreground truncate min-w-0">
                    {assignment.workout.name}
                  </h3>
                  {assignment.workout.cycle_length &&
                    assignment.workout.cycle_position && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-indigo-soft text-indigo-fg border border-indigo-line rounded-full px-2 py-0.5 tabular-nums shrink-0">
                        Day {assignment.workout.cycle_position} / {assignment.workout.cycle_length}
                      </span>
                    )}
                </div>
                {isOwnAssignment && (
                  <IconButton
                    tone="danger"
                    onClick={() =>
                      setPendingUnassign({
                        id: assignment.id,
                        name: assignment.workout.name,
                      })
                    }
                    aria-label="Unassign workout"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </div>

              <div className="px-6 pt-3 pb-6">
                {(assignment.workout.description || assignment.notes) && (
                  <div className="mb-4">
                    {assignment.workout.description && (
                      <p className="text-muted text-sm">{assignment.workout.description}</p>
                    )}
                    {assignment.notes && (
                      <p className="text-indigo-fg text-sm mt-2 italic">
                        Coach note: {assignment.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* At-a-glance summary so trainees can budget time before
                    expanding the exercise list. Exercise + set counts come
                    from the embed; the duration is a rough estimate (see
                    estimateWorkoutSeconds for the heuristics). */}
                {(() => {
                  const exList = assignment.workout.exercises ?? []
                  if (exList.length === 0) return null
                  const setCount = exList.reduce(
                    (n, ex) => n + (ex.exercise_sets?.length ?? 0),
                    0
                  )
                  const est = estimateWorkoutSeconds(exList)
                  return (
                    <div className="mb-3 flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted tabular-nums">
                      <span>
                        <span className="font-semibold text-foreground">
                          {exList.length}
                        </span>{' '}
                        {exList.length === 1 ? 'exercise' : 'exercises'}
                      </span>
                      <span className="text-faint">·</span>
                      <span>
                        <span className="font-semibold text-foreground">{setCount}</span>{' '}
                        {setCount === 1 ? 'set' : 'sets'}
                      </span>
                      {est > 0 && (
                        <>
                          <span className="text-faint">·</span>
                          <span className="font-medium text-muted">
                            {formatEstimate(est)}
                          </span>
                        </>
                      )}
                    </div>
                  )
                })()}

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button
                    onClick={() =>
                      setExpanded(expanded === assignment.id ? null : assignment.id)
                    }
                    className="text-left text-indigo-fg hover:text-indigo-fg-strong font-medium text-sm cursor-pointer"
                  >
                    {expanded === assignment.id ? '▼ Hide' : '▶ Show'} Exercises (
                    {assignment.workout.exercises?.length ?? 0})
                  </button>
                  {expanded === assignment.id && (() => {
                    // Determine if any exercise is currently collapsed so the
                    // bulk button can pick the more useful next action.
                    const groups = groupsByAssignment.get(assignment.id) ?? []
                    const allKeys = groups.map((g, gi) =>
                      g.exercises.length === 1
                        ? `${assignment.id}::solo::${g.exercises[0].id ?? g.startIndex}`
                        : `${assignment.id}::group::${gi}`
                    )
                    const anyCollapsed = allKeys.some(k => collapsedKeys.has(k))
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setCollapsedKeys(prev => {
                            const next = new Set(prev)
                            if (anyCollapsed) {
                              // Expand: drop every key for this assignment.
                              for (const k of allKeys) next.delete(k)
                            } else {
                              // Collapse: add them all.
                              for (const k of allKeys) next.add(k)
                            }
                            return next
                          })
                        }}
                        className="text-xs font-semibold uppercase tracking-widest text-subtle hover:text-foreground cursor-pointer"
                      >
                        {anyCollapsed ? 'Expand all' : 'Collapse all'}
                      </button>
                    )
                  })()}
                </div>

                {expanded === assignment.id && (
                  <div className="mt-4 space-y-3">
                    {(groupsByAssignment.get(assignment.id) ?? []).map((group, gi) => {
                      // Solo exercise → keep the per-exercise vertical-table logger.
                      if (group.exercises.length === 1) {
                        const exercise = group.exercises[0]
                        const isCardio = exercise.exercise_type === 'cardio'
                        const soloKey = `${assignment.id}::solo::${exercise.id ?? group.startIndex}`
                        const isCollapsed = collapsedKeys.has(soloKey)
                        // Active swap (null = original). Use override if seeded;
                        // otherwise fall back to whatever the fetch attached.
                        const overrideKey = exercise.id ? subKey(assignment.id, exercise.id) : null
                        const activeSub = overrideKey && subOverrides.has(overrideKey)
                          ? subOverrides.get(overrideKey) ?? null
                          : exercise.substitution ?? null
                        const displayName = activeSub ?? exercise.name
                        const cardioTargets =
                          isCardio
                            ? (exercise.exercise_sets ?? [])
                                .map(s => s.target_duration_seconds)
                                .filter((s): s is number => s != null && s > 0)
                            : []
                        const cardioSummary =
                          cardioTargets.length === 0
                            ? null
                            : cardioTargets.length === 1
                              ? formatDuration(cardioTargets[0])
                              : `${cardioTargets.length} × ${formatDuration(cardioTargets[0])}`
                        return (
                          <div
                            key={exercise.id ?? group.startIndex}
                            className={`rounded-lg ${
 isCardio
 ? 'bg-amber-wash border border-amber-line '
 : 'bg-elevated '
 }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(soloKey)}
                              aria-expanded={!isCollapsed}
                              className="w-full p-4 text-left cursor-pointer"
                            >
                              {/* On mobile, stack name and metadata vertically
                                  so a long exercise name can't push the Rest /
                                  Target chips onto a half-wrapped line. At
                                  sm+ the original side-by-side layout returns. */}
                              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 sm:flex-wrap">
                                <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
                                  <span className="text-subtle shrink-0">
                                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                  </span>
                                  <span className="text-muted text-sm font-medium shrink-0">
                                    {group.startIndex + 1}.
                                  </span>
                                  <span
                                    className="font-semibold text-foreground wrap-break-word"
                                    title={displayName}
                                  >
                                    {displayName}
                                  </span>
                                  {activeSub && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-fg bg-indigo-soft border border-indigo-line rounded-full px-2 py-0.5 shrink-0"
                                      title={`Swapped from ${exercise.name}`}
                                    >
                                      <span className="text-indigo-500">↺</span>
                                      <span className="text-indigo-500">from</span>
                                      <span className="font-semibold truncate max-w-[10rem]">
                                        {exercise.name}
                                      </span>
                                    </span>
                                  )}
                                  {isCardio && (
                                    <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-semibold text-amber-fg bg-amber-strong border border-amber-line rounded px-1.5 py-px shrink-0">
                                      <HeartPulse size={10} />
                                      Cardio
                                    </span>
                                  )}
                                </div>
                                {(cardioSummary || (exercise.rest_seconds != null && exercise.rest_seconds > 0)) && (
                                  <div className="flex items-baseline gap-3 flex-wrap pl-6 sm:pl-0 sm:shrink-0">
                                    {cardioSummary && (
                                      <span className="text-xs text-amber-fg whitespace-nowrap">
                                        Target:{' '}
                                        <span className="font-semibold tabular-nums">
                                          {cardioSummary}
                                        </span>
                                      </span>
                                    )}
                                    {exercise.rest_seconds != null && exercise.rest_seconds > 0 && (
                                      <span className="text-xs text-muted whitespace-nowrap">
                                        Rest:{' '}
                                        <span className="font-medium">{exercise.rest_seconds}s</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </button>
                            {!isCollapsed && (
                              <div className="px-4 pb-4">
                                {exercise.id && (exercise.alternatives?.length ?? 0) > 0 && (
                                  <div className="mb-3">
                                    <SubstitutionPicker
                                      assignmentId={assignment.id}
                                      exerciseId={exercise.id}
                                      loggedDate={selectedDate}
                                      originalName={exercise.name}
                                      alternatives={exercise.alternatives ?? []}
                                      current={activeSub}
                                      onChange={next =>
                                        setActiveSub(assignment.id, exercise.id!, next)
                                      }
                                    />
                                  </div>
                                )}
                                {exercise.notes && (
                                  <p className="text-muted text-sm italic mb-2">
                                    {exercise.notes}
                                  </p>
                                )}
                                <ExerciseSetLogger
                                  clientId={clientId}
                                  assignmentId={assignment.id}
                                  exercise={exercise}
                                  loggedDate={selectedDate}
                                  currentVariant={activeSub}
                                  onAllSetsCompleted={() => handleAnyAllSetsCompleted(soloKey)}
                                />
                              </div>
                            )}
                          </div>
                        )
                      }

                      // 2+ exercises chained by `pair_with_next` → superset.
                      const exerciseLetters = group.exercises
                        .map((_, i) => String.fromCharCode(65 + i))
                        .join(' → ')
                      const groupKey = `${assignment.id}::group::${gi}`
                      const isCollapsed = collapsedKeys.has(groupKey)
                      return (
                        <div
                          key={`group-${gi}`}
                          className="rounded-xl border-2 border-indigo-300 bg-indigo-wash overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(groupKey)}
                            aria-expanded={!isCollapsed}
                            className="w-full bg-indigo-600 text-white px-3 py-2 flex items-center justify-between gap-2 flex-wrap text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white/80 shrink-0">
                                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 rounded-full px-2.5 py-0.5">
                                Superset
                              </span>
                              <span className="text-xs font-medium tabular-nums">
                                {exerciseLetters}
                              </span>
                            </div>
                            <span className="text-[10px] text-indigo-100">
                              {isCollapsed
                                ? `${group.exercises.length} exercises`
                                : 'Do them back-to-back, then rest. Repeat per round.'}
                            </span>
                          </button>
                          {!isCollapsed && (
                            <div className="p-3 space-y-2">
                              <div className="space-y-2 mb-2">
                                {group.exercises.map((ex, j) => {
                                  const isCardio = ex.exercise_type === 'cardio'
                                  const firstDuration =
                                    isCardio
                                      ? ex.exercise_sets?.find(
                                          s => s.target_duration_seconds != null && s.target_duration_seconds > 0
                                        )?.target_duration_seconds ?? null
                                      : null
                                  const overrideKey = ex.id ? subKey(assignment.id, ex.id) : null
                                  const activeSub =
                                    overrideKey && subOverrides.has(overrideKey)
                                      ? subOverrides.get(overrideKey) ?? null
                                      : ex.substitution ?? null
                                  const displayName = activeSub ?? ex.name
                                  return (
                                    <div key={ex.id ?? j} className="text-xs">
                                      {/* min-w-0 on the row + the name span
                                          lets truncate actually kick in so a
                                          long "A" name doesn't push "B" down
                                          to its own line. */}
                                      <div className="flex items-baseline gap-2 min-w-0">
                                        <span
                                          className={`font-bold tabular-nums shrink-0 ${
 isCardio ? 'text-amber-fg ' : 'text-indigo-fg '
 }`}
                                        >
                                          {String.fromCharCode(65 + j)}
                                        </span>
                                        <span
                                          className="font-medium text-foreground truncate min-w-0"
                                          title={displayName}
                                        >
                                          {displayName}
                                        </span>
                                        {activeSub && (
                                          <span
                                            className="text-[9px] uppercase tracking-widest font-semibold text-indigo-fg bg-indigo-soft border border-indigo-line rounded px-1 py-px shrink-0"
                                            title={`Swapped from ${ex.name}`}
                                          >
                                            Swapped
                                          </span>
                                        )}
                                        {isCardio && firstDuration != null && (
                                          <span className="text-amber-fg font-medium tabular-nums shrink-0">
                                            {formatDuration(firstDuration)}
                                          </span>
                                        )}
                                        {ex.notes && (
                                          <span className="text-muted italic truncate hidden sm:inline">
                                            &middot; {ex.notes}
                                          </span>
                                        )}
                                      </div>
                                      {ex.id && (ex.alternatives?.length ?? 0) > 0 && (
                                        <div className="ml-4">
                                          <SubstitutionPicker
                                            assignmentId={assignment.id}
                                            exerciseId={ex.id}
                                            loggedDate={selectedDate}
                                            originalName={ex.name}
                                            alternatives={ex.alternatives ?? []}
                                            current={activeSub}
                                            onChange={next =>
                                              setActiveSub(assignment.id, ex.id!, next)
                                            }
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                              <SupersetLogger
                                clientId={clientId}
                                assignmentId={assignment.id}
                                exercises={group.exercises}
                                loggedDate={selectedDate}
                                variantByExerciseId={
                                  new Map(
                                    group.exercises
                                      .filter(e => e.id)
                                      .map(e => {
                                        const k = subKey(assignment.id, e.id!)
                                        return [
                                          e.id!,
                                          subOverrides.has(k)
                                            ? subOverrides.get(k) ?? null
                                            : e.substitution ?? null,
                                        ] as const
                                      })
                                  )
                                }
                                onAllSetsCompleted={() => handleAnyAllSetsCompleted(groupKey)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingUnassign}
        title="Unassign workout?"
        message={
          pendingUnassign
            ? `"${pendingUnassign.name}" will be removed from your assigned workouts. This cannot be undone.`
            : ''
        }
        confirmLabel="Unassign"
        destructive
        onConfirm={handleUnassign}
        onCancel={() => setPendingUnassign(null)}
      />
    </div>
  )
}
