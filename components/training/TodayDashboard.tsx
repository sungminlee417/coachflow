'use client'

import { useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
// Re-exports for the mobile bottom-nav so the file can register the
// "Today" icon without importing from this implementation file.
import { ClipboardList, Ruler, Utensils } from 'lucide-react'
import { formatDuration, todayISO } from '@/lib/utils'
import { showToast } from '@/components/ui/Toast'
import { useWorkoutAssignments } from '@/lib/hooks/use-assignments'
import { useDaySetLogs } from '@/lib/hooks/use-set-logs'
import type { Profile } from '@/lib/types'
import {
  greetingForHour,
  parseLocalISO,
  SectionHeader,
  type TodayNavOptions,
  type TodayNavTarget,
} from './today/primitives'
import { HeroStats } from './today/HeroStats'
import { WelcomeBanner } from './today/WelcomeBanner'
import { WorkoutCard } from './today/WorkoutCard'
import { MealsCard } from './today/MealsCard'
import { WeightCard } from './today/WeightCard'
import { StreakCard } from './today/StreakCard'
import { WaterCard } from './today/WaterCard'
import { BodyMeasurementCard } from './today/BodyMeasurementCard'
import { CoachSection } from './today/CoachSection'
import { UnfinishedWorkoutBanner } from './today/UnfinishedWorkoutBanner'

// Secondary cards lazy-loaded — they only matter once the trainee
// scrolls past the active workout/meal cards, and the monthly recap is
// only rendered during the first week of a month. Splitting them keeps
// the Today initial JS chunk a touch leaner.
const WeeklySummaryCard = dynamic(
  () => import('./today/WeeklySummaryCard').then(m => m.WeeklySummaryCard),
  { ssr: false }
)
const MonthlyRecapCard = dynamic(
  () => import('./today/MonthlyRecapCard').then(m => m.MonthlyRecapCard),
  { ssr: false }
)

interface TodayDashboardProps {
  user: { id: string; full_name?: string | null }
  profile: Profile
  /** Hop directly into a deep view (Workouts, Meals, Body, Clients).
   *  The optional `options.date` lets a card (e.g. the unfinished
   *  workout banner) ask the destination view to jump to a specific
   *  calendar day instead of its default. */
  onNavigate: (tab: TodayNavTarget, options?: TodayNavOptions) => void
}

export type { TodayNavOptions, TodayNavTarget }
export { ClipboardList, Utensils, Ruler }

/**
 * "Today" home dashboard. Surfaces the few things a trainee actually
 * cares about on a typical morning — their workout, their meals, their
 * weight log — as compact cards. Each card is a tap target that deep-
 * links into the corresponding full view. Data is read from the same
 * cached query keys the deep views use, so opening Today after a
 * tab-switch is a cache hit, and a write in either place shows up here
 * on next render.
 *
 * Every card lives in its own file under [today/](./today). This file
 * is just the top-level layout: greeting, hero stats, sections.
 */
export default function TodayDashboard({
  user,
  profile,
  onNavigate,
}: TodayDashboardProps) {
  const today = todayISO()

  // Workout-complete celebration. Lifted up here from ClientWorkoutView so
  // it fires regardless of WHERE the trainee logged the final set — the
  // inline mini-logger on the Today WorkoutCard, the deep
  // ExerciseSetLogger inside ClientWorkoutView, or the SupersetLogger.
  // All three patch the same shared day-set-logs cache; this watcher
  // sees the transition and fires the toast.
  //
  // Gating: we only celebrate when we observed an *incomplete* state at
  // least once during this mount. Cold-loading an already-finished day
  // never fires (no flicker), and the `celebratedKeyRef` keeps the toast
  // to once per (date, sets-count, completion-count) signature so the
  // user doesn't see it twice if they bounce around tabs.
  const todayAssignmentsQuery = useWorkoutAssignments(user.id, today)
  const todayAssignmentIds = useMemo(
    () => (todayAssignmentsQuery.data ?? []).map(a => a.id),
    [todayAssignmentsQuery.data]
  )
  const todaySetLogsQuery = useDaySetLogs({
    clientId: user.id,
    date: today,
    assignmentIds: todayAssignmentIds,
  })
  const todayProgress = useMemo(() => {
    const assignments = todayAssignmentsQuery.data ?? []
    const logs = todaySetLogsQuery.data
    let prescribedSets = 0
    let completedSets = 0
    let totalReps = 0
    let totalVolume = 0
    let totalDurationSeconds = 0
    for (const a of assignments) {
      for (const ex of a.workout.exercises ?? []) {
        const prescribed = ex.exercise_sets?.length ?? ex.sets ?? 0
        prescribedSets += prescribed
        if (!ex.id || !logs) continue
        for (let n = 1; n <= prescribed; n++) {
          const row = logs.get(`${a.id}::${ex.id}::${n}`)
          if (!row?.completed) continue
          completedSets += 1
          if (row.reps_performed != null) totalReps += row.reps_performed
          if (row.weight_performed != null && row.reps_performed != null) {
            totalVolume += row.weight_performed * row.reps_performed
          }
          if (row.duration_performed_seconds != null) {
            totalDurationSeconds += row.duration_performed_seconds
          }
        }
      }
    }
    const isComplete = prescribedSets > 0 && completedSets >= prescribedSets
    return {
      prescribedSets,
      completedSets,
      totalReps,
      totalVolume,
      totalDurationSeconds,
      isComplete,
    }
  }, [todayAssignmentsQuery.data, todaySetLogsQuery.data])

  const sawIncompleteRef = useRef(false)
  const celebratedKeyRef = useRef<string | null>(null)
  // Reset gates on date rollover (midnight crossing while the tab sits
  // open) so a new day's first incomplete observation re-arms the toast.
  useEffect(() => {
    sawIncompleteRef.current = false
    celebratedKeyRef.current = null
  }, [today])
  useEffect(() => {
    if (todayProgress.prescribedSets === 0) return
    if (!todayProgress.isComplete) {
      sawIncompleteRef.current = true
      return
    }
    if (!sawIncompleteRef.current) return
    const key = `${today}::${todayProgress.prescribedSets}::${todayProgress.completedSets}`
    if (celebratedKeyRef.current === key) return
    celebratedKeyRef.current = key
    const parts: string[] = [
      `${todayProgress.completedSets} set${todayProgress.completedSets === 1 ? '' : 's'}`,
    ]
    if (todayProgress.totalReps > 0) parts.push(`${todayProgress.totalReps} reps`)
    if (todayProgress.totalVolume > 0) {
      parts.push(`${Math.round(todayProgress.totalVolume).toLocaleString()} lb volume`)
    }
    if (todayProgress.totalDurationSeconds > 0) {
      parts.push(formatDuration(todayProgress.totalDurationSeconds))
    }
    showToast(`Workout complete · ${parts.join(' · ')}`, 'success')
  }, [
    today,
    todayProgress.completedSets,
    todayProgress.isComplete,
    todayProgress.prescribedSets,
    todayProgress.totalDurationSeconds,
    todayProgress.totalReps,
    todayProgress.totalVolume,
  ])

  const firstName = (profile.full_name ?? '').split(' ')[0]?.trim() || ''
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), [])
  const dateLabel = useMemo(
    () =>
      parseLocalISO(today).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [today]
  )

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold text-subtle uppercase tracking-widest">
          {dateLabel}
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-1">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </h2>
      </header>

      <WelcomeBanner userId={user.id} onNavigate={onNavigate} />

      <HeroStats clientId={user.id} loggedDate={today} />

      <MonthlyRecapCard clientId={user.id} onOpen={() => onNavigate('history')} />

      <WeeklySummaryCard clientId={user.id} onOpen={() => onNavigate('history')} />

      <section className="space-y-3">
        <SectionHeader title="Training" />
        <UnfinishedWorkoutBanner clientId={user.id} onResume={onNavigate} />
        {/* Hero rows — full-width because they pack the most info
            (next set logger, meal toggles). */}
        <WorkoutCard
          clientId={user.id}
          loggedDate={today}
          onOpen={() => onNavigate('assigned-workouts')}
        />
        <MealsCard
          clientId={user.id}
          loggedDate={today}
          onOpen={() => onNavigate('assigned-meals')}
        />
        {/* Hydration lives right below meals — same "log throughout the
            day" model, and pairing it with nutrition helps trainees
            remember to sip alongside eating. Full-width so the three
            quick-add buttons + progress bar breathe on any phone. */}
        <WaterCard
          userId={user.id}
          weightUnit={profile.weight_unit ?? 'lbs'}
          goalMl={profile.water_daily_goal_ml ?? null}
          onOpen={() => onNavigate('measurements')}
        />
        {/* Secondary tiles — paired side-by-side on every viewport
            (including phones) so the dashboard reads as a mosaic
            instead of a row-row-row stack. Content inside each is
            already condensed enough for a half-width column.
            Streak card respects the per-user preference; when hidden,
            the Weight card spans the full grid row on its own. */}
        <div
          className={`grid gap-3 ${
            profile.show_streak_card === false ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          <WeightCard
            userId={user.id}
            weightUnit={profile.weight_unit ?? 'lbs'}
            weightGoal={profile.weight_goal ?? null}
            onOpen={() => onNavigate('measurements')}
          />
          {profile.show_streak_card !== false && (
            <StreakCard
              clientId={user.id}
              onOpen={() => onNavigate('history')}
            />
          )}
        </div>
        <BodyMeasurementCard
          userId={user.id}
          onOpen={() => onNavigate('measurements')}
        />
      </section>

      <CoachSection coachId={user.id} onNavigate={onNavigate} />
    </div>
  )
}
