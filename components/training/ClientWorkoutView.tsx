'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { WeekSelector } from '@/components/ui/WeekSelector'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { Trash2 } from 'lucide-react'
import { todayISO, formatLongDate, unwrapJoin } from '@/lib/utils'
import type { Exercise, WorkoutAssignment } from '@/lib/types'

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
      const { data, error } = await supabase
        .from('workout_assignments')
        .select(`
          id, assigned_date, completed, notes, coach_id,
          workout:workout_id (
            id, name, description,
            exercises ( id, name, sets, reps, weight, rest_seconds, notes, order_index )
          )
        `)
        .eq('client_id', clientId)
        .eq('assigned_date', selectedDate)
        .order('assigned_date', { ascending: false })

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalized = (data || []).map((item: any) => {
        const workout = unwrapJoin<{
          id: string
          name: string
          description: string
          exercises: Exercise[]
        }>(item.workout)
        return {
          ...item,
          workout: {
            ...workout,
            exercises: (workout?.exercises || []).sort(
              (a: Exercise, b: Exercise) => a.order_index - b.order_index
            ),
          },
        }
      })

      setAssignments(normalized)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAssignments() }, [selectedDate])

  const handleComplete = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from('workout_assignments')
        .update({
          completed: !current,
          completed_at: !current ? new Date().toISOString() : null,
        })
        .eq('id', id)

      if (error) throw error

      setAssignments(prev =>
        prev.map(a => (a.id === id ? { ...a, completed: !current } : a))
      )
    } catch {
    }
  }

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
              className={`bg-white rounded-xl border overflow-hidden ${
                assignment.completed ? 'border-emerald-500 border-2' : 'border-slate-200'
              }`}
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleComplete(assignment.id, assignment.completed)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm cursor-pointer transition-colors ${
                        assignment.completed
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {assignment.completed ? '✓ Completed' : 'Mark Complete'}
                    </button>
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
                        <div className="mb-2">
                          <span className="text-slate-500 text-sm font-medium mr-2">
                            {index + 1}.
                          </span>
                          <span className="font-semibold text-slate-900">{exercise.name}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm ml-6">
                          {exercise.sets != null && (
                            <div>
                              <span className="text-slate-500">Sets:</span>{' '}
                              <span className="font-medium">{exercise.sets}</span>
                            </div>
                          )}
                          {exercise.reps && (
                            <div>
                              <span className="text-slate-500">Reps:</span>{' '}
                              <span className="font-medium">{exercise.reps}</span>
                            </div>
                          )}
                          {exercise.weight && (
                            <div>
                              <span className="text-slate-500">Weight:</span>{' '}
                              <span className="font-medium">{exercise.weight}</span>
                            </div>
                          )}
                          {exercise.rest_seconds != null && (
                            <div>
                              <span className="text-slate-500">Rest:</span>{' '}
                              <span className="font-medium">{exercise.rest_seconds}s</span>
                            </div>
                          )}
                        </div>
                        {exercise.notes && (
                          <p className="text-slate-600 text-sm mt-2 ml-6 italic">
                            Note: {exercise.notes}
                          </p>
                        )}
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
