'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from './Toast'
import { Plus, Send, Pencil, Trash2, Dumbbell } from 'lucide-react'
import WorkoutBuilder from './WorkoutBuilder'
import WorkoutAssignment from './WorkoutAssignment'

interface Workout {
  id: string
  name: string
  description: string
  is_template: boolean
  created_at: string
  exercise_count?: number
}

interface WorkoutLibraryProps {
  coachId: string
}

export default function WorkoutLibrary({ coachId }: WorkoutLibraryProps) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [showAssignment, setShowAssignment] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null)
  const [assigningWorkout, setAssigningWorkout] = useState<Workout | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchWorkouts()
  }, [])

  const fetchWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select(`
          id,
          name,
          description,
          is_template,
          created_at,
          exercises (count)
        `)
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const workoutsWithCount = data?.map(w => ({
        ...w,
        exercise_count: w.exercises?.[0]?.count || 0
      })) || []

      setWorkouts(workoutsWithCount)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNew = () => {
    setEditingWorkout(null)
    setShowBuilder(true)
  }

  const handleEdit = (workout: Workout) => {
    setEditingWorkout(workout)
    setShowBuilder(true)
  }

  const handleDelete = async (workoutId: string) => {
    if (!confirm('Are you sure you want to delete this workout?')) return

    try {
      const { error } = await supabase
        .from('workouts')
        .delete()
        .eq('id', workoutId)

      if (error) throw error

      await fetchWorkouts()
      showToast('Workout deleted')
    } catch {
      showToast('Failed to delete workout', 'error')
    }
  }

  const handleAssign = (workout: Workout) => {
    setAssigningWorkout(workout)
    setShowAssignment(true)
  }

  const handleClose = () => {
    setShowBuilder(false)
    setEditingWorkout(null)
    fetchWorkouts()
  }

  const handleCloseAssignment = () => {
    setShowAssignment(false)
    setAssigningWorkout(null)
  }

  if (showBuilder) {
    return (
      <WorkoutBuilder
        coachId={coachId}
        workout={editingWorkout}
        onClose={handleClose}
      />
    )
  }

  if (loading) {
    return <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>
  }

  return (
    <div>
      {showAssignment && assigningWorkout && (
        <WorkoutAssignment
          coachId={coachId}
          workoutId={assigningWorkout.id}
          workoutName={assigningWorkout.name}
          onClose={handleCloseAssignment}
        />
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Workout Library</h2>
          <p className="text-sm text-slate-500 mt-1">
            {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Create Workout
        </button>
      </div>

      {workouts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Dumbbell size={20} className="text-slate-400" />
          </div>
          <p className="text-slate-500 mb-1">No workouts yet</p>
          <p className="text-sm text-slate-400 mb-5">Create your first workout template</p>
          <button
            onClick={handleCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors cursor-pointer"
          >
            <Plus size={16} />
            Create Your First Workout
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workouts.map((workout) => (
            <div key={workout.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 transition-colors">
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
              <p className="text-xs text-slate-400 mb-4">
                {workout.exercise_count} {workout.exercise_count === 1 ? 'exercise' : 'exercises'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAssign(workout)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors cursor-pointer"
                >
                  <Send size={14} />
                  Assign
                </button>
                <button
                  onClick={() => handleEdit(workout)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  aria-label="Edit workout"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(workout.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  aria-label="Delete workout"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
