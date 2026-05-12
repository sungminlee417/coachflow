'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Plus, Send, Pencil, Trash2, Dumbbell } from 'lucide-react'
import type { Workout } from '@/lib/types'
import { CardGridSkeleton } from '@/components/ui/Skeleton'
import WorkoutBuilder from './WorkoutBuilder'
import WorkoutAssignmentModal from './WorkoutAssignmentModal'

interface WorkoutLibraryProps {
  coachId: string
}

export default function WorkoutLibrary({ coachId }: WorkoutLibraryProps) {
  const supabase = useSupabase()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null)
  const [assigningWorkout, setAssigningWorkout] = useState<Workout | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchWorkouts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select(
          'id, name, description, is_template, days_of_week, cycle_length, cycle_position, created_at, exercises (count)'
        )
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const list = (data || []).map(w => ({
        ...w,
        exercise_count: w.exercises?.[0]?.count || 0,
      }))
      setWorkouts(list)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const { error } = await supabase.from('workouts').delete().eq('id', deletingId)
      if (error) throw error
      await fetchWorkouts()
      showToast('Workout deleted')
    } catch {
      showToast('Failed to delete workout', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  if (showBuilder) {
    return (
      <WorkoutBuilder
        coachId={coachId}
        workout={editingWorkout}
        onClose={() => {
          setShowBuilder(false)
          setEditingWorkout(null)
          fetchWorkouts()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Workout Library</h2>
            <p className="text-sm text-slate-400 mt-1">Loading workouts…</p>
          </div>
        </div>
        <CardGridSkeleton count={6} />
      </div>
    )
  }

  return (
    <div>
      <WorkoutAssignmentModal
        open={!!assigningWorkout}
        coachId={coachId}
        workoutId={assigningWorkout?.id ?? ''}
        workoutName={assigningWorkout?.name ?? ''}
        cycleLength={assigningWorkout?.cycle_length ?? null}
        cyclePosition={assigningWorkout?.cycle_position ?? null}
        onClose={() => setAssigningWorkout(null)}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Delete workout?"
        message="This will permanently remove the workout and its exercises. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Workout Library</h2>
          <p className="text-sm text-slate-500 mt-1">
            {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
          </p>
        </div>
        <Button
          onClick={() => { setEditingWorkout(null); setShowBuilder(true) }}
          className="w-full sm:w-auto"
        >
          <Plus size={16} />
          Create Workout
        </Button>
      </div>

      {workouts.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No workouts yet"
          description="Create your first workout template"
          action={
            <Button onClick={() => { setEditingWorkout(null); setShowBuilder(true) }}>
              <Plus size={16} />
              Create Your First Workout
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workouts.map(workout => (
            <div
              key={workout.id}
              className="bg-white rounded-xl border border-slate-200 p-5 transition-all hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-slate-900">{workout.name}</h3>
                {workout.is_template && (
                  <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-50 text-purple-600 border border-purple-200 rounded-full">
                    Template
                  </span>
                )}
              </div>
              {workout.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{workout.description}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <p className="text-xs text-slate-400">
                  {workout.exercise_count} {workout.exercise_count === 1 ? 'exercise' : 'exercises'}
                </p>
                {workout.cycle_length && workout.cycle_position && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5 tabular-nums">
                    {workout.cycle_length}-day · day {workout.cycle_position}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <Button onClick={() => setAssigningWorkout(workout)} className="flex-1">
                  <Send size={16} />
                  Assign
                </Button>
                <IconButton
                  onClick={() => { setEditingWorkout(workout); setShowBuilder(true) }}
                  aria-label="Edit workout"
                >
                  <Pencil size={16} />
                </IconButton>
                <IconButton
                  tone="danger"
                  onClick={() => setDeletingId(workout.id)}
                  aria-label="Delete workout"
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
