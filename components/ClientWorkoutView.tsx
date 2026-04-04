'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Exercise {
  id: string
  name: string
  sets: number | null
  reps: string
  weight: string
  rest_seconds: number | null
  notes: string
  order_index: number
}

interface WorkoutAssignment {
  id: string
  assigned_date: string
  completed: boolean
  notes: string | null
  workout: {
    id: string
    name: string
    description: string
  }
  exercises: Exercise[]
}

interface ClientWorkoutViewProps {
  clientId: string
}

export default function ClientWorkoutView({ clientId }: ClientWorkoutViewProps) {
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchAssignments()
  }, [selectedDate])

  const fetchAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('workout_assignments')
        .select(`
          id,
          assigned_date,
          completed,
          notes,
          workout:workout_id (
            id,
            name,
            description
          )
        `)
        .eq('client_id', clientId)
        .eq('assigned_date', selectedDate)
        .order('assigned_date', { ascending: false })

      if (error) throw error

      // Fetch exercises for each workout
      const assignmentsWithExercises = await Promise.all(
        (data || []).map(async (assignment: any) => {
          const { data: exercises } = await supabase
            .from('exercises')
            .select('*')
            .eq('workout_id', assignment.workout.id)
            .order('order_index')

          return {
            ...assignment,
            exercises: exercises || []
          }
        })
      )

      setAssignments(assignmentsWithExercises)
    } catch (error) {
      console.error('Error fetching assignments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteWorkout = async (assignmentId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('workout_assignments')
        .update({
          completed: !currentStatus,
          completed_at: !currentStatus ? new Date().toISOString() : null
        })
        .eq('id', assignmentId)

      if (error) throw error

      await fetchAssignments()
    } catch (error) {
      console.error('Error updating workout:', error)
      alert('Failed to update workout status')
    }
  }

  const getWeekDates = () => {
    const today = new Date(selectedDate)
    const dayOfWeek = today.getDay()
    const diff = today.getDate() - dayOfWeek
    const sunday = new Date(today.setDate(diff))

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(sunday)
      date.setDate(sunday.getDate() + i)
      return date.toISOString().split('T')[0]
    })
  }

  const weekDates = getWeekDates()
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">My Workouts</h2>

        {/* Week selector */}
        <div className="grid grid-cols-7 gap-2 mb-6">
          {weekDates.map((date, index) => {
            const isSelected = date === selectedDate
            const isToday = date === new Date().toISOString().split('T')[0]
            const day = new Date(date).getDate()

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`p-3 rounded-lg text-center transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : isToday
                    ? 'bg-blue-100 text-blue-900'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="text-xs font-medium">{dayNames[index]}</div>
                <div className="text-lg font-bold">{day}</div>
              </button>
            )
          })}
        </div>

        {/* Selected date display */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </h3>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">No workouts assigned for this day</p>
          <p className="text-sm text-gray-400 mt-2">Check other days or contact your coach</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className={`bg-white rounded-lg shadow overflow-hidden ${
                assignment.completed ? 'border-2 border-green-500' : ''
              }`}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                      {assignment.workout.name}
                    </h3>
                    {assignment.workout.description && (
                      <p className="text-gray-600 text-sm">{assignment.workout.description}</p>
                    )}
                    {assignment.notes && (
                      <p className="text-blue-600 text-sm mt-2 italic">
                        Coach note: {assignment.notes}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCompleteWorkout(assignment.id, assignment.completed)}
                    className={`px-4 py-2 rounded-md font-medium text-sm ${
                      assignment.completed
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {assignment.completed ? '✓ Completed' : 'Mark Complete'}
                  </button>
                </div>

                <button
                  onClick={() => setExpandedWorkout(expandedWorkout === assignment.id ? null : assignment.id)}
                  className="w-full text-left text-blue-600 hover:text-blue-800 font-medium text-sm mb-2"
                >
                  {expandedWorkout === assignment.id ? '▼ Hide Exercises' : '▶ Show Exercises'} ({assignment.exercises.length})
                </button>

                {expandedWorkout === assignment.id && (
                  <div className="mt-4 space-y-3">
                    {assignment.exercises.map((exercise, index) => (
                      <div key={exercise.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <span className="text-gray-500 text-sm font-medium mr-2">
                              {index + 1}.
                            </span>
                            <span className="font-semibold text-gray-900">{exercise.name}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm ml-6">
                          {exercise.sets && (
                            <div>
                              <span className="text-gray-500">Sets:</span>
                              <span className="ml-1 font-medium">{exercise.sets}</span>
                            </div>
                          )}
                          {exercise.reps && (
                            <div>
                              <span className="text-gray-500">Reps:</span>
                              <span className="ml-1 font-medium">{exercise.reps}</span>
                            </div>
                          )}
                          {exercise.weight && (
                            <div>
                              <span className="text-gray-500">Weight:</span>
                              <span className="ml-1 font-medium">{exercise.weight}</span>
                            </div>
                          )}
                          {exercise.rest_seconds && (
                            <div>
                              <span className="text-gray-500">Rest:</span>
                              <span className="ml-1 font-medium">{exercise.rest_seconds}s</span>
                            </div>
                          )}
                        </div>
                        {exercise.notes && (
                          <p className="text-gray-600 text-sm mt-2 ml-6 italic">
                            Note: {exercise.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
