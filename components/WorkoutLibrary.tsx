'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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
    } catch (error) {
      console.error('Error fetching workouts:', error)
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
    } catch (error) {
      console.error('Error deleting workout:', error)
      alert('Failed to delete workout')
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

  if (showAssignment && assigningWorkout) {
    return (
      <WorkoutAssignment
        coachId={coachId}
        workoutId={assigningWorkout.id}
        workoutName={assigningWorkout.name}
        onClose={handleCloseAssignment}
      />
    )
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Workout Library</h2>
          <p className="text-gray-600 mt-1">
            {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Workout
        </button>
      </div>

      {workouts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">No workouts yet. Create your first workout template!</p>
          <button
            onClick={handleCreateNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create Your First Workout
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workouts.map((workout) => (
            <div key={workout.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{workout.name}</h3>
                  {workout.description && (
                    <p className="text-sm text-gray-600 mt-1">{workout.description}</p>
                  )}
                </div>
                {workout.is_template && (
                  <span className="ml-2 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded">
                    Template
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500 mb-4">
                {workout.exercise_count} {workout.exercise_count === 1 ? 'exercise' : 'exercises'}
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleAssign(workout)}
                  className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                >
                  Assign to Client
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(workout)}
                    className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(workout.id)}
                    className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
