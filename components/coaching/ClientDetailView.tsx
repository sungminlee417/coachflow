'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { IconButton } from '@/components/ui/IconButton'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ArrowLeft, CheckCircle, Clock, Trash2, Apple, Dumbbell } from 'lucide-react'
import { formatDate, unwrapJoin } from '@/lib/utils'
import type { Client } from '@/lib/types'
import WorkoutAssignmentModal from './WorkoutAssignmentModal'
import MealPlanAssignmentModal from './MealPlanAssignmentModal'

interface WorkoutAssignmentRow {
  id: string
  assigned_date: string
  completed: boolean
  completed_at: string | null
  workout: { id: string; name: string } | null
}

interface MealPlanAssignmentRow {
  id: string
  start_date: string | null
  end_date: string | null
  meal_plan: { id: string; name: string } | null
}

interface WorkoutOption {
  id: string
  name: string
}

interface MealPlanOption {
  id: string
  name: string
}

interface ClientDetailViewProps {
  client: Client
  coachId: string
  onBack: () => void
}

type DeleteTarget =
  | { kind: 'workout'; id: string; label: string }
  | { kind: 'meal-plan'; id: string; label: string }

export default function ClientDetailView({ client, coachId, onBack }: ClientDetailViewProps) {
  const supabase = useSupabase()
  const [workoutAssignments, setWorkoutAssignments] = useState<WorkoutAssignmentRow[]>([])
  const [mealPlanAssignments, setMealPlanAssignments] = useState<MealPlanAssignmentRow[]>([])
  const [workouts, setWorkouts] = useState<WorkoutOption[]>([])
  const [mealPlans, setMealPlans] = useState<MealPlanOption[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningWorkout, setAssigningWorkout] = useState<WorkoutOption | null>(null)
  const [assigningMealPlan, setAssigningMealPlan] = useState<MealPlanOption | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null)
  const [stats, setStats] = useState({
    totalAssigned: 0,
    totalCompleted: 0,
    completionRate: 0,
    currentWeekCompleted: 0,
  })

  useEffect(() => {
    Promise.all([
      fetchWorkoutAssignments(),
      fetchMealPlanAssignments(),
      fetchWorkouts(),
      fetchMealPlans(),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchWorkoutAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('workout_assignments')
        .select('id, assigned_date, completed, completed_at, workout:workout_id ( id, name )')
        .eq('client_id', client.id)
        .order('assigned_date', { ascending: false })
        .limit(30)

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: WorkoutAssignmentRow[] = (data || []).map((item: any) => ({
        ...item,
        workout: unwrapJoin<{ id: string; name: string }>(item.workout),
      }))
      setWorkoutAssignments(rows)

      const totalAssigned = rows.length
      const totalCompleted = rows.filter(w => w.completed).length
      const completionRate =
        totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const currentWeekCompleted = rows.filter(
        w => w.completed && w.completed_at && new Date(w.completed_at) >= weekAgo
      ).length

      setStats({ totalAssigned, totalCompleted, completionRate, currentWeekCompleted })
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const fetchMealPlanAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('meal_plan_assignments')
        .select('id, start_date, end_date, meal_plan:meal_plan_id ( id, name )')
        .eq('client_id', client.id)
        .order('start_date', { ascending: false, nullsFirst: false })

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: MealPlanAssignmentRow[] = (data || []).map((item: any) => ({
        ...item,
        meal_plan: unwrapJoin<{ id: string; name: string }>(item.meal_plan),
      }))
      setMealPlanAssignments(rows)
    } catch {
    }
  }

  const fetchWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select('id, name')
        .eq('coach_id', coachId)
        .order('name')

      if (error) throw error
      setWorkouts(data || [])
    } catch {
    }
  }

  const fetchMealPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, name')
        .eq('coach_id', coachId)
        .order('name')

      if (error) throw error
      setMealPlans(data || [])
    } catch {
    }
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return
    const table =
      pendingDelete.kind === 'workout' ? 'workout_assignments' : 'meal_plan_assignments'
    try {
      const { error } = await supabase.from(table).delete().eq('id', pendingDelete.id)
      if (error) throw error
      showToast('Removed')
      if (pendingDelete.kind === 'workout') {
        await fetchWorkoutAssignments()
      } else {
        await fetchMealPlanAssignments()
      }
    } catch {
      showToast('Failed to remove', 'error')
    } finally {
      setPendingDelete(null)
    }
  }

  const formatRange = (start: string | null, end: string | null) => {
    if (!start && !end) return 'Active'
    if (start && !end) return `From ${formatDate(start)}`
    if (!start && end) return `Until ${formatDate(end)}`
    return `${formatDate(start!)} → ${formatDate(end!)}`
  }

  return (
    <div>
      <WorkoutAssignmentModal
        open={!!assigningWorkout}
        coachId={coachId}
        workoutId={assigningWorkout?.id ?? ''}
        workoutName={assigningWorkout?.name ?? ''}
        preselectedClientId={client.id}
        onClose={() => {
          setAssigningWorkout(null)
          fetchWorkoutAssignments()
        }}
      />

      <MealPlanAssignmentModal
        open={!!assigningMealPlan}
        coachId={coachId}
        mealPlanId={assigningMealPlan?.id ?? ''}
        mealPlanName={assigningMealPlan?.name ?? ''}
        preselectedClientId={client.id}
        onClose={() => {
          setAssigningMealPlan(null)
          fetchMealPlanAssignments()
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title={
          pendingDelete?.kind === 'workout'
            ? 'Remove this workout assignment?'
            : 'Remove this meal plan assignment?'
        }
        message={
          pendingDelete
            ? `"${pendingDelete.label}" will be removed from this client. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove"
        destructive
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <IconButton onClick={onBack} aria-label="Go back">
            <ArrowLeft size={18} />
          </IconButton>
          <Avatar name={client.full_name} />
          <div>
            <h2 className="text-xl font-bold text-slate-900">{client.full_name}</h2>
            <p className="text-sm text-slate-500">{client.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            onChange={e => {
              const w = workouts.find(x => x.id === e.target.value)
              if (w) {
                setAssigningWorkout(w)
                e.target.value = ''
              }
            }}
            defaultValue=""
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Assign workout"
            disabled={workouts.length === 0}
          >
            <option value="" disabled>
              {workouts.length === 0 ? 'No workouts' : '+ Assign Workout'}
            </option>
            {workouts.map(w => (
              <option key={w.id} value={w.id} className="bg-white text-slate-900">
                {w.name}
              </option>
            ))}
          </select>

          <select
            onChange={e => {
              const p = mealPlans.find(x => x.id === e.target.value)
              if (p) {
                setAssigningMealPlan(p)
                e.target.value = ''
              }
            }}
            defaultValue=""
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Assign meal plan"
            disabled={mealPlans.length === 0}
          >
            <option value="" disabled>
              {mealPlans.length === 0 ? 'No meal plans' : '+ Assign Meal Plan'}
            </option>
            {mealPlans.map(p => (
              <option key={p.id} value={p.id} className="bg-white text-slate-900">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">{stats.totalAssigned}</div>
          <div className="text-xs text-slate-500 mt-0.5">Total Assigned</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-emerald-600">{stats.totalCompleted}</div>
          <div className="text-xs text-slate-500 mt-0.5">Completed</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-indigo-600">{stats.completionRate}%</div>
          <div className="text-xs text-slate-500 mt-0.5">Completion Rate</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-purple-600">{stats.currentWeekCompleted}</div>
          <div className="text-xs text-slate-500 mt-0.5">This Week</div>
        </div>
      </div>

      {/* Active Meal Plans */}
      <div className="flex items-center gap-2 mb-3">
        <Apple size={14} className="text-emerald-500" />
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Active Meal Plans
        </h3>
      </div>
      {mealPlanAssignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center mb-8">
          <p className="text-slate-500 text-sm mb-1">No meal plans assigned</p>
          <p className="text-xs text-slate-400">Pick one from the &ldquo;Assign Meal Plan&rdquo; menu above</p>
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {mealPlanAssignments.map(a => (
            <div
              key={a.id}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Apple size={16} className="text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">
                    {a.meal_plan?.name ?? 'Meal Plan'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatRange(a.start_date, a.end_date)}
                  </p>
                </div>
              </div>
              <IconButton
                tone="danger"
                onClick={() =>
                  setPendingDelete({
                    kind: 'meal-plan',
                    id: a.id,
                    label: a.meal_plan?.name ?? 'Meal Plan',
                  })
                }
                aria-label="Remove meal plan assignment"
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {/* Recent Workout Assignments */}
      <div className="flex items-center gap-2 mb-3">
        <Dumbbell size={14} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Recent Workout Assignments
        </h3>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>
      ) : workoutAssignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <p className="text-slate-500 text-sm mb-1">No workouts assigned yet</p>
          <p className="text-xs text-slate-400">
            Pick a workout from the menu above to assign their first one
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {workoutAssignments.map(a => (
            <div
              key={a.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                a.completed
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {a.completed ? (
                  <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                ) : (
                  <Clock size={18} className="text-slate-400 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">
                    {a.workout?.name ?? 'Workout'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assigned: {formatDate(a.assigned_date)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.completed ? (
                  <span className="text-xs font-medium text-emerald-600">
                    Completed{a.completed_at ? ` ${formatDate(a.completed_at)}` : ''}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Pending</span>
                )}
                <IconButton
                  tone="danger"
                  onClick={() =>
                    setPendingDelete({
                      kind: 'workout',
                      id: a.id,
                      label: a.workout?.name ?? 'Workout',
                    })
                  }
                  aria-label="Remove workout assignment"
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
