'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { WeekSelector } from '@/components/ui/WeekSelector'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { Trash2 } from 'lucide-react'
import { todayISO, formatLongDate, unwrapJoin, weekdayOf } from '@/lib/utils'
import type { DayOfWeek, Exercise, ExerciseSet, WorkoutAssignment } from '@/lib/types'
import { ExerciseSetLogger } from './ExerciseSetLogger'

interface ClientWorkoutViewProps {
  clientId: string
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
      // An assignment is active on selectedDate if its [start_date, end_date]
      // window contains the date (with nulls treated as open-ended).
      const { data, error } = await supabase
        .from('workout_assignments')
        .select(`
          id, start_date, end_date, completed, completed_at, notes, coach_id,
          workout:workout_id (
            id, name, description, days_of_week,
            exercises (
              id, name, sets, reps, weight, rest_seconds, notes, order_index,
              exercise_sets ( id, set_number, target_reps, notes )
            )
          )
        `)
        .eq('client_id', clientId)
        .or(`start_date.is.null,start_date.lte.${selectedDate}`)
        .or(`end_date.is.null,end_date.gte.${selectedDate}`)

      if (error) throw error

      const weekday = weekdayOf(selectedDate)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalized = (data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => {
          const workout = unwrapJoin<{
            id: string
            name: string
            description: string
            days_of_week: DayOfWeek[] | null
            exercises: Exercise[]
          }>(item.workout)
          return {
            ...item,
            workout: {
              ...workout,
              days_of_week: workout?.days_of_week ?? [],
              exercises: (workout?.exercises || [])
                .slice()
                .sort((a: Exercise, b: Exercise) => a.order_index - b.order_index)
                .map((ex: Exercise) => ({
                  ...ex,
                  exercise_sets: (ex.exercise_sets || [])
                    .slice()
                    .sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number),
                })),
            },
          }
        })
        // Filter to workouts scheduled for this weekday.
        // Empty days_of_week = "every day" (always show).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((item: any) => {
          const days: DayOfWeek[] = item.workout?.days_of_week ?? []
          return days.length === 0 || days.includes(weekday as DayOfWeek)
        })

      setAssignments(normalized)
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
        <div className="text-center py-8 text-slate-400">Loading...</div>
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const isOwnAssignment = (assignment as any).coach_id === clientId
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
                    {assignment.workout.exercises?.map((exercise, index) => (
                      <div key={exercise.id ?? index} className="bg-slate-50 rounded-lg p-4">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <div>
                            <span className="text-slate-500 text-sm font-medium mr-2">
                              {index + 1}.
                            </span>
                            <span className="font-semibold text-slate-900">{exercise.name}</span>
                          </div>
                          {exercise.rest_seconds != null && (
                            <span className="text-xs text-slate-500 flex-shrink-0">
                              Rest: <span className="font-medium">{exercise.rest_seconds}s</span>
                            </span>
                          )}
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
                    ))}
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
