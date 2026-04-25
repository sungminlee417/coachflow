'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface WorkoutAssignment {
  id: string
  assigned_date: string
  completed: boolean
  completed_at: string | null
  workout: {
    id: string
    name: string
    description: string
  }
}

interface WorkoutHistoryProps {
  clientId: string
}

export default function WorkoutHistory({ clientId }: WorkoutHistoryProps) {
  const [completedWorkouts, setCompletedWorkouts] = useState<WorkoutAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalCompleted: 0,
    currentWeekCompleted: 0,
    currentMonthCompleted: 0
  })
  const supabase = createClient()

  useEffect(() => {
    fetchWorkoutHistory()
  }, [])

  const fetchWorkoutHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('workout_assignments')
        .select(`
          id,
          assigned_date,
          completed,
          completed_at,
          workout:workout_id (
            id,
            name,
            description
          )
        `)
        .eq('client_id', clientId)
        .eq('completed', true)
        .order('completed_at', { ascending: false })
        .limit(20)

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workouts = (data || []).map((item: any) => ({
        ...item,
        workout: Array.isArray(item.workout) ? item.workout[0] : item.workout,
      }))
      setCompletedWorkouts(workouts)

      // Calculate stats
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const currentWeekCompleted = workouts.filter(w =>
        w.completed_at && new Date(w.completed_at) >= weekAgo
      ).length

      const currentMonthCompleted = workouts.filter(w =>
        w.completed_at && new Date(w.completed_at) >= monthAgo
      ).length

      setStats({
        totalCompleted: workouts.length,
        currentWeekCompleted,
        currentMonthCompleted
      })
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return <div className="text-center py-8">Loading history...</div>
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Workout History</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow p-6 text-white">
          <div className="text-3xl font-bold mb-1">{stats.currentWeekCompleted}</div>
          <div className="text-indigo-100 text-sm">This Week</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow p-6 text-white">
          <div className="text-3xl font-bold mb-1">{stats.currentMonthCompleted}</div>
          <div className="text-emerald-100 text-sm">This Month</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow p-6 text-white">
          <div className="text-3xl font-bold mb-1">{stats.totalCompleted}</div>
          <div className="text-purple-100 text-sm">All Time</div>
        </div>
      </div>

      {/* Workout History List */}
      {completedWorkouts.length === 0 ? (
        <div className="bg-slate-50 rounded-lg p-8 text-center">
          <p className="text-slate-500">No completed workouts yet</p>
          <p className="text-sm text-slate-400 mt-2">Complete your first workout to see it here!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {completedWorkouts.map((assignment) => (
            <div
              key={assignment.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-4 border-l-4 border-emerald-500"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">{assignment.workout.name}</h3>
                  {assignment.workout.description && (
                    <p className="text-sm text-slate-600 mt-1">{assignment.workout.description}</p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm text-slate-500">
                    {assignment.completed_at ? formatDate(assignment.completed_at) : 'Unknown'}
                  </div>
                  <div className="flex items-center mt-1 text-emerald-600 text-xs font-medium">
                    <span className="mr-1">✓</span>
                    Completed
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
