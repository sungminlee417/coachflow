'use client'

import { useMemo } from 'react'
// Re-exports for the mobile bottom-nav so the file can register the
// "Today" icon without importing from this implementation file.
import { ClipboardList, Ruler, Utensils } from 'lucide-react'
import { todayISO } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import {
  greetingForHour,
  parseLocalISO,
  SectionHeader,
  type TodayNavTarget,
} from './today/primitives'
import { HeroStats } from './today/HeroStats'
import { WelcomeBanner } from './today/WelcomeBanner'
import { WorkoutCard } from './today/WorkoutCard'
import { MealsCard } from './today/MealsCard'
import { WeightCard } from './today/WeightCard'
import { StreakCard } from './today/StreakCard'
import { BodyMeasurementCard } from './today/BodyMeasurementCard'
import { CoachSection } from './today/CoachSection'

interface TodayDashboardProps {
  user: { id: string; full_name?: string | null }
  profile: Profile
  /** Hop directly into a deep view (Workouts, Meals, Body, Clients). */
  onNavigate: (tab: TodayNavTarget) => void
}

export type { TodayNavTarget }
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
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          {dateLabel}
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </h2>
      </header>

      <WelcomeBanner userId={user.id} onNavigate={onNavigate} />

      <HeroStats clientId={user.id} loggedDate={today} />

      <section className="space-y-3">
        <SectionHeader title="Training" />
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
