'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { unwrapJoin, formatDate } from '@/lib/utils'

interface CompletedAssignment {
  id: string
  assigned_date: string
  completed: boolean
  completed_at: string | null
  workout: { id: string; name: string; description?: string } | null
}

interface WorkoutHistoryProps {
  clientId: string
}

export default function WorkoutHistory({ clientId }: WorkoutHistoryProps) {
  const supabase = useSupabase()
  const [items, setItems] = useState<CompletedAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalCompleted: 0, weekCompleted: 0, monthCompleted: 0 })

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('workout_assignments')
        .select(`
          id, assigned_date, completed, completed_at,
          workout:workout_id ( id, name, description )
        `)
        .eq('client_id', clientId)
        .eq('completed', true)
        .order('completed_at', { ascending: false })
        .limit(20)

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: CompletedAssignment[] = (data || []).map((item: any) => ({
        ...item,
        workout: unwrapJoin(item.workout),
      }))
      setItems(list)

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      setStats({
        totalCompleted: list.length,
        weekCompleted: list.filter(w => w.completed_at && new Date(w.completed_at) >= weekAgo).length,
        monthCompleted: list.filter(w => w.completed_at && new Date(w.completed_at) >= monthAgo).length,
      })
    } catch {
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-center py-8 text-slate-400">Loading history...</div>

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Workout History</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-indigo-600 rounded-xl p-6 text-white">
          <div className="text-3xl font-bold mb-1">{stats.weekCompleted}</div>
          <div className="text-indigo-100 text-sm">This Week</div>
        </div>
        <div className="bg-emerald-600 rounded-xl p-6 text-white">
          <div className="text-3xl font-bold mb-1">{stats.monthCompleted}</div>
          <div className="text-emerald-100 text-sm">This Month</div>
        </div>
        <div className="bg-purple-600 rounded-xl p-6 text-white">
          <div className="text-3xl font-bold mb-1">{stats.totalCompleted}</div>
          <div className="text-purple-100 text-sm">All Time</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-slate-50 rounded-xl p-8 text-center">
          <p className="text-slate-500">No completed workouts yet</p>
          <p className="text-sm text-slate-400 mt-2">Complete your first workout to see it here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 hover:shadow-sm transition-shadow p-4 border-l-4 border-l-emerald-500"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">{item.workout?.name ?? 'Workout'}</h3>
                  {item.workout?.description && (
                    <p className="text-sm text-slate-500 mt-1">{item.workout.description}</p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm text-slate-500">
                    {item.completed_at ? formatDate(item.completed_at, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }) : 'Unknown'}
                  </div>
                  <div className="flex items-center justify-end mt-1 text-emerald-600 text-xs font-medium">
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
