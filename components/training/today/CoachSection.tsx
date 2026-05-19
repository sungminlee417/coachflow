'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Apple,
  ArrowRight,
  Dumbbell,
  ListChecks,
  Users,
} from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { Card, CardSkeletonBody, SectionHeader, type TodayNavTarget } from './primitives'

export function CoachSection({
  coachId,
  onNavigate,
}: {
  coachId: string
  onNavigate: (tab: TodayNavTarget) => void
}) {
  const supabase = useSupabase()
  const countsQuery = useQuery({
    queryKey: ['coach_counts', coachId] as const,
    queryFn: async () => {
      // Fire all four counts in parallel. `head: true` + `count: 'exact'`
      // tells PostgREST to return only the count without the rows.
      const [clientsRes, workoutsRes, programsRes, mealPlansRes] = await Promise.all([
        supabase
          .from('coach_client_relationships')
          .select('client_id', { count: 'exact', head: true })
          .eq('coach_id', coachId)
          .eq('status', 'active')
          .neq('client_id', coachId),
        supabase
          .from('workouts')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', coachId),
        supabase
          .from('workout_programs')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', coachId),
        supabase
          .from('meal_plans')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', coachId),
      ])
      return {
        clients: clientsRes.count ?? 0,
        workouts: workoutsRes.count ?? 0,
        programs: programsRes.count ?? 0,
        mealPlans: mealPlansRes.count ?? 0,
      }
    },
  })
  const counts = countsQuery.data ?? null
  // Don't commit to the "first-run" CTA branch while a refetch is in flight
  // (or the cache is stale and the refetch hasn't started yet) over a
  // cached all-zero snapshot — otherwise the dashed empty tile flashes
  // for coaches who actually have content, before the real counts land.
  const countsAreZero =
    !!counts &&
    counts.clients === 0 &&
    counts.workouts === 0 &&
    counts.programs === 0 &&
    counts.mealPlans === 0
  const stillResolving =
    !counts ||
    (countsAreZero && (countsQuery.isFetching || countsQuery.isStale))

  // Skip the whole section while loading is still null AND there's never
  // been any coaching content. Once there's at least one client or one
  // template, the section sticks around.
  if (stillResolving) {
    return (
      <section className="space-y-3">
        <SectionHeader title="Coaching" />
        <div className="bg-surface rounded-2xl border border-line p-5">
          <CardSkeletonBody lines={2} />
        </div>
      </section>
    )
  }

  const hasAny =
    counts.clients > 0 ||
    counts.workouts > 0 ||
    counts.programs > 0 ||
    counts.mealPlans > 0
  if (!hasAny) {
    // First-run: empty Coaching section is just a soft CTA tile. Tap
    // routes to the workout library where they can build their first one.
    return (
      <section className="space-y-3">
        <SectionHeader title="Coaching" />
        <button
          type="button"
          onClick={() => onNavigate('my-workouts')}
          className="w-full text-left bg-surface rounded-2xl border border-dashed border-line p-5 hover:border-indigo-300 hover:bg-indigo-wash transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-elevated text-muted flex items-center justify-center">
              <Dumbbell size={16} />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                Build your first workout
              </p>
              <p className="text-xs text-muted mt-0.5">
                Coach yourself or invite a client — same tools either way.
              </p>
            </div>
            <ArrowRight size={14} className="ml-auto text-faint" />
          </div>
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Coaching" />
      <Card
        icon={Users}
        label="Clients"
        accent="indigo"
        onClick={() => onNavigate('my-clients')}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-foreground">
            <span className="text-2xl tabular-nums">{counts.clients}</span>
            <span className="text-sm text-muted font-normal">
              {' '}
              {counts.clients === 1 ? 'client' : 'clients'}
            </span>
          </p>
          <p className="text-xs text-muted shrink-0">
            {counts.clients === 0 ? 'Invite to start' : 'Manage'}
          </p>
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        <LibraryTile
          label="Workouts"
          count={counts.workouts}
          icon={Dumbbell}
          onClick={() => onNavigate('my-workouts')}
        />
        <LibraryTile
          label="Programs"
          count={counts.programs}
          icon={ListChecks}
          onClick={() => onNavigate('my-programs')}
        />
        <LibraryTile
          label="Meal plans"
          count={counts.mealPlans}
          icon={Apple}
          onClick={() => onNavigate('my-meal-plans')}
        />
      </div>
    </section>
  )
}

function LibraryTile({
  label,
  count,
  icon: Icon,
  onClick,
}: {
  label: string
  count: number
  icon: typeof Dumbbell
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-surface rounded-xl border border-line p-3 hover:border-indigo-line hover:shadow-sm transition-all cursor-pointer text-left"
    >
      <Icon size={14} className="text-subtle mb-1.5" />
      <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
        {count}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-widest text-subtle mt-0.5">
        {label}
      </p>
    </button>
  )
}
