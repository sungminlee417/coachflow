'use client'

import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import type { TodayNavTarget } from './primitives'

/**
 * Welcome / first-run banner. Visible only when the user appears to have
 * nothing yet — no workouts they own AND no workout assignments to do.
 * Renders below the greeting and steers them at the two most useful
 * starting actions: build a template (self-coach or coach others) or
 * accept an invite code (be coached). Disappears as soon as they have
 * any content; query is cached so reloads after onboarding don't
 * re-fetch.
 */
export function WelcomeBanner({
  userId,
  onNavigate,
}: {
  userId: string
  onNavigate: (tab: TodayNavTarget) => void
}) {
  const supabase = useSupabase()
  // Fast existence checks — only need to know "is there at least one
  // row?". `limit(1)` keeps the payload tiny.
  const firstRunQuery = useQuery({
    queryKey: ['first_run', userId] as const,
    queryFn: async () => {
      const [workoutsRes, assignmentsRes] = await Promise.all([
        supabase.from('workouts').select('id').eq('coach_id', userId).limit(1),
        supabase
          .from('workout_assignments')
          .select('id')
          .eq('client_id', userId)
          .limit(1),
      ])
      const hasWorkouts = (workoutsRes.data ?? []).length > 0
      const hasAssignments = (assignmentsRes.data ?? []).length > 0
      return !hasWorkouts && !hasAssignments
    },
  })
  const show = firstRunQuery.data

  if (!show) return null

  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-white p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
        Welcome
      </p>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
        Let&rsquo;s get you set up
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
        Every CoachFlow account can coach and train. Pick where to start:
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onNavigate('my-workouts')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Build a workout
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Make a template you can assign to yourself or a client.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('my-clients')}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Invite a client
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Generate a code to bring someone you coach onto the app.
          </p>
        </button>
      </div>
    </div>
  )
}
