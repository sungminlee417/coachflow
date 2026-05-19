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
    <div className="rounded-2xl border border-indigo-line card-tint-indigo p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-fg">
        Welcome
      </p>
      <h3 className="text-lg font-bold text-foreground mt-1">
        Let&rsquo;s get you set up
      </h3>
      <p className="text-sm text-muted mt-1">
        Every CoachFlow account can coach and train. Pick where to start:
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onNavigate('my-workouts')}
          className="text-left rounded-xl border border-line bg-surface p-3 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-foreground">
            Build a workout
          </p>
          <p className="text-xs text-muted mt-0.5">
            Make a template you can assign to yourself or a client.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('my-clients')}
          className="text-left rounded-xl border border-line bg-surface p-3 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-foreground">
            Invite a client
          </p>
          <p className="text-xs text-muted mt-0.5">
            Generate a code to bring someone you coach onto the app.
          </p>
        </button>
      </div>
    </div>
  )
}
