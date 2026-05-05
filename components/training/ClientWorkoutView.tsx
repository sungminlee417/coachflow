'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { WeekSelector } from '@/components/ui/WeekSelector'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { HeartPulse, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDuration, todayISO, formatLongDate } from '@/lib/utils'
import { fetchActiveWorkoutAssignments } from '@/lib/queries'
import type { Exercise, WorkoutAssignment } from '@/lib/types'
import { ExerciseSetLogger } from './ExerciseSetLogger'
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

export default function ClientWorkoutView({ clientId }: ClientWorkoutViewProps) {
  const supabase = useSupabase()
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([])
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingUnassign, setPendingUnassign] = useState<{ id: string; name: string } | null>(null)

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

  const fetchAssignments = async () => {
    setLoading(true)
    try {
      const data = await fetchActiveWorkoutAssignments(supabase, clientId, selectedDate)
      setAssignments(data)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAssignments() }, [selectedDate])

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-4">My Workouts</h2>

      <WeekSelector selectedDate={selectedDate} onSelect={setSelectedDate} tone="brand" />

      <h3 className="text-lg font-semibold mb-4">{formatLongDate(selectedDate)}</h3>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 p-6"
            >
              <Skeleton className="h-5 w-1/3 mb-2" />
              <Skeleton className="h-3 w-2/3 mb-4" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="bg-slate-50 rounded-xl p-8 text-center">
          <p className="text-slate-500">No workouts assigned for this day</p>
          <p className="text-sm text-slate-400 mt-2">
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
              className="bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-slate-900 mb-1">
                      {assignment.workout.name}
                    </h3>
                    {assignment.workout.description && (
                      <p className="text-slate-600 text-sm">{assignment.workout.description}</p>
                    )}
                    {assignment.notes && (
                      <p className="text-indigo-600 text-sm mt-2 italic">
                        Coach note: {assignment.notes}
                      </p>
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

                <button
                  onClick={() =>
                    setExpanded(expanded === assignment.id ? null : assignment.id)
                  }
                  className="w-full text-left text-indigo-600 hover:text-indigo-800 font-medium text-sm cursor-pointer"
                >
                  {expanded === assignment.id ? '▼ Hide' : '▶ Show'} Exercises (
                  {assignment.workout.exercises?.length ?? 0})
                </button>

                {expanded === assignment.id && (
                  <div className="mt-4 space-y-3">
                    {groupExercises(assignment.workout.exercises ?? []).map((group, gi) => {
                      // Solo exercise → keep the per-exercise vertical-table logger.
                      if (group.exercises.length === 1) {
                        const exercise = group.exercises[0]
                        const isCardio = exercise.exercise_type === 'cardio'
                        // For single-set cardio, show the target time inline as a hero summary.
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
                            className={`rounded-lg p-4 ${
                              isCardio
                                ? 'bg-amber-50/40 border border-amber-100'
                                : 'bg-slate-50'
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
                              <div className="flex items-baseline gap-2 min-w-0">
                                <span className="text-slate-500 text-sm font-medium">
                                  {group.startIndex + 1}.
                                </span>
                                <span className="font-semibold text-slate-900">
                                  {exercise.name}
                                </span>
                                {isCardio && (
                                  <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-px">
                                    <HeartPulse size={10} />
                                    Cardio
                                  </span>
                                )}
                              </div>
                              <div className="flex items-baseline gap-3 shrink-0">
                                {cardioSummary && (
                                  <span className="text-xs text-amber-700">
                                    Target:{' '}
                                    <span className="font-semibold tabular-nums">
                                      {cardioSummary}
                                    </span>
                                  </span>
                                )}
                                {exercise.rest_seconds != null && exercise.rest_seconds > 0 && (
                                  <span className="text-xs text-slate-500">
                                    Rest:{' '}
                                    <span className="font-medium">{exercise.rest_seconds}s</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            {exercise.notes && (
                              <p className="text-slate-600 text-sm italic mb-2">
                                {exercise.notes}
                              </p>
                            )}
                            <ExerciseSetLogger
                              assignmentId={assignment.id}
                              exercise={exercise}
                            />
                          </div>
                        )
                      }

                      // 2+ exercises chained by `pair_with_next` → superset.
                      const exerciseLetters = group.exercises
                        .map((_, i) => String.fromCharCode(65 + i))
                        .join(' → ')
                      return (
                        <div
                          key={`group-${gi}`}
                          className="rounded-xl border-2 border-indigo-300 bg-indigo-50/30 overflow-hidden"
                        >
                          <div className="bg-indigo-600 text-white px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-widest bg-white/20 rounded-full px-2.5 py-0.5">
                                Superset
                              </span>
                              <span className="text-xs font-medium tabular-nums">
                                {exerciseLetters}
                              </span>
                            </div>
                            <span className="text-[10px] text-indigo-100">
                              Do them back-to-back, then rest. Repeat per round.
                            </span>
                          </div>
                          <div className="p-3 space-y-2">
                            <div className="space-y-1 mb-2">
                              {group.exercises.map((ex, j) => {
                                const isCardio = ex.exercise_type === 'cardio'
                                const firstDuration =
                                  isCardio
                                    ? ex.exercise_sets?.find(
                                        s => s.target_duration_seconds != null && s.target_duration_seconds > 0
                                      )?.target_duration_seconds ?? null
                                    : null
                                return (
                                  <div
                                    key={ex.id ?? j}
                                    className="flex items-baseline gap-2 text-xs"
                                  >
                                    <span
                                      className={`font-bold tabular-nums ${
                                        isCardio ? 'text-amber-600' : 'text-indigo-700'
                                      }`}
                                    >
                                      {String.fromCharCode(65 + j)}
                                    </span>
                                    <span className="font-medium text-slate-900 truncate">
                                      {ex.name}
                                    </span>
                                    {isCardio && firstDuration != null && (
                                      <span className="text-amber-700 font-medium tabular-nums">
                                        {formatDuration(firstDuration)}
                                      </span>
                                    )}
                                    {ex.notes && (
                                      <span className="text-slate-500 italic truncate">
                                        &middot; {ex.notes}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            <SupersetLogger
                              assignmentId={assignment.id}
                              exercises={group.exercises}
                            />
                          </div>
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
