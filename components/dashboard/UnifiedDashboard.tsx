'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { User } from '@supabase/supabase-js'
import { Dumbbell, LogOut, X, Settings as SettingsIcon } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Avatar } from '@/components/ui/Avatar'
import { RestTimerProvider } from '@/components/ui/RestTimer'
import { AuthGuard } from '@/components/ui/AuthGuard'
import { clearPersistedQueryCache } from '@/lib/query-client'
import { ProfileThemeSync } from '@/lib/theme'
import ClientList from '@/components/coaching/clients/ClientList'
import WorkoutLibrary from '@/components/coaching/workouts/WorkoutLibrary'
import ProgramLibrary from '@/components/coaching/programs/ProgramLibrary'
import MealPlanLibrary from '@/components/coaching/meal-plans/MealPlanLibrary'
import ClientWorkoutView from '@/components/training/workouts/ClientWorkoutView'
import ClientMealPlanView from '@/components/training/meals/ClientMealPlanView'
import WorkoutHistory from '@/components/training/history/WorkoutHistory'
import BodyTracker from '@/components/training/measurements/BodyTracker'
import TodayDashboard, {
  type TodayNavOptions,
  type TodayNavTarget,
} from '@/components/training/TodayDashboard'
import SettingsView from '@/components/dashboard/SettingsView'
import type { Profile } from '@/lib/types'
import { type Tab, TABS } from './tabs'
import { NavSectionList } from './NavSectionList'
import { MobileBottomNav } from './MobileBottomNav'

interface UnifiedDashboardProps {
  user: User
  profile: Profile
}

// Default landing tab — the Today hub. A reload always brings the user
// back here. Bookmark `/app` and it's the same experience as a fresh
// sign-in.
const DEFAULT_TAB: Tab = 'today'

export default function UnifiedDashboard({ user, profile }: UnifiedDashboardProps) {
  const supabase = useSupabase()

  // Pure React state — every fresh session / reload lands on Today, and
  // tab navigation is invisible in the URL. The previous URL-driven
  // approach made sense when there was no home page, but Today is now
  // the canonical landing surface and the URL noise was hurting more
  // than it helped (per the user's UX feedback). Bookmark `/app` and
  // you'll always come back to the hub.
  const [activeTab, setActiveTab] = useState<Tab>(DEFAULT_TAB)
  // Pending "jump to this date" passed by Today cards (currently only
  // the unfinished-workout banner). Lives at the dashboard level so it
  // survives the activeTab switch and is then consumed by ClientWorkoutView.
  const [pendingWorkoutDate, setPendingWorkoutDate] = useState<string | null>(null)

  const handleTodayNavigate = (tab: TodayNavTarget, options?: TodayNavOptions) => {
    if (options?.date && tab === 'assigned-workouts') {
      setPendingWorkoutDate(options.date)
    }
    setActiveTab(tab)
  }

  const [coach, setCoach] = useState<Profile | null>(null)
  const [loadingCoach, setLoadingCoach] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Once a tab has been visited it stays mounted (hidden via CSS when not
  // active) so switching back is instant — no remount, no re-fetch, no
  // skeleton flash. Pays a one-time mount cost the first visit; from then
  // on tab nav is free. The biggest felt win is bouncing between Workouts
  // and Meals on the trainee side, which were each re-fetching every tap.
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(
    () => new Set([activeTab])
  )
  useEffect(() => {
    setMountedTabs(prev => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)))
  }, [activeTab])

  // Close the drawer on Escape and lock background scroll while open.
  useEffect(() => {
    if (!mobileMenuOpen) return
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    document.addEventListener('keydown', escHandler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', escHandler)
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    fetchCoach()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCoach = async () => {
    try {
      // Find the user's external coach (excluding the self-coaching row).
      const { data: relationship } = await supabase
        .from('coach_client_relationships')
        .select('coach_id, profiles:coach_id(*)')
        .eq('client_id', user.id)
        .eq('status', 'active')
        .neq('coach_id', user.id)
        .maybeSingle()

      if (relationship?.profiles) setCoach(relationship.profiles as unknown as Profile)
    } catch {
    } finally {
      setLoadingCoach(false)
    }
  }

  const handleLogout = async () => {
    // Drop the offline cache before navigating away so the next account
    // logging in on this device doesn't inherit the previous user's
    // weight / workout / measurement snapshots. The SW's HTML cache also
    // pins the prior dashboard render — message it to flush so the next
    // sign-in doesn't briefly flash the old account's bundled HTML.
    await clearPersistedQueryCache()
    if (
      typeof navigator !== 'undefined' &&
      navigator.serviceWorker?.controller
    ) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHES' })
    }
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Single nav handler shared by the desktop sidebar nav, mobile drawer
  // nav, and mobile bottom bar. Always closes the drawer so tapping any
  // destination dismisses it.
  const handleSelectTab = (tab: Tab) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
  }

  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label ?? ''

  return (
    <RestTimerProvider userId={user.id}>
    <AuthGuard />
    {/* Pull profile.theme into the in-memory ThemeProvider on mount so
        a theme set on another device flips this device on next load. */}
    <ProfileThemeSync profileTheme={profile.theme} />
    <div className="min-h-screen bg-canvas">
      <div className="flex">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-surface border-r border-line">
          <div className="h-16 flex items-center gap-2.5 px-6 border-b border-line-subtle">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Dumbbell size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">CoachFlow</span>
          </div>

          <NavSectionList activeTab={activeTab} onSelect={handleSelectTab} />

          <div className="border-t border-line-subtle p-4 flex items-center gap-3">
            <Avatar name={profile.full_name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{profile.full_name}</p>
              <p className="text-xs text-muted truncate">{profile.email}</p>
            </div>
            <IconButton
              onClick={() => handleSelectTab('settings')}
              aria-label="Settings"
            >
              <SettingsIcon size={16} />
            </IconButton>
            <IconButton onClick={handleLogout} aria-label="Logout">
              <LogOut size={16} />
            </IconButton>
          </div>
        </aside>

        {/* Mobile header — title only. Navigation is the bottom tab bar +
            "More" drawer; the old top hamburger is gone. */}
        <div className="md:hidden fixed top-0 left-0 right-0 bg-surface border-b border-line z-40">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Dumbbell size={14} className="text-white" />
            </div>
            <span className="text-base font-semibold text-foreground truncate">
              {activeTabLabel}
            </span>
          </div>
        </div>

        {/* Mobile drawer (always mounted; transitions on open/close) */}
        <>
          {/* Backdrop */}
          <div
            className={`md:hidden fixed inset-0 bg-black/40 z-50 transition-opacity duration-200 ${
              mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Slide-in panel */}
          <aside
            className={`md:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-surface border-r border-line z-50 flex flex-col shadow-xl transition-transform duration-200 ease-out ${
 mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
 }`}
            role="dialog"
            aria-label="Navigation menu"
            aria-hidden={!mobileMenuOpen}
          >
              <div className="h-14 flex items-center justify-between px-4 border-b border-line-subtle">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <Dumbbell size={16} className="text-white" />
                  </div>
                  <span className="text-lg font-bold text-foreground tracking-tight">CoachFlow</span>
                </div>
                <IconButton
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X size={18} />
                </IconButton>
              </div>

              <NavSectionList
                activeTab={activeTab}
                onSelect={handleSelectTab}
                includeSettings
              />

              <div className="border-t border-line-subtle p-4 flex items-center gap-3">
                <Avatar name={profile.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profile.full_name}</p>
                  <p className="text-xs text-muted truncate">{profile.email}</p>
                </div>
                <IconButton onClick={handleLogout} aria-label="Logout">
                  <LogOut size={16} />
                </IconButton>
              </div>
          </aside>
        </>

        {/* Main content. Bottom padding leaves room for the mobile tab bar.
            Each tab renders inside a `TabPanel` that mounts on first visit
            and stays in the DOM thereafter (hidden via `display: none` when
            inactive). State and any in-flight fetches survive tab switches,
            so going Workouts → Meals → Workouts is instant. */}
        <main className="flex-1 min-w-0 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
            <TabPanel active={activeTab === 'today'} mounted={mountedTabs.has('today')}>
              <TodayDashboard
                user={user}
                profile={profile}
                onNavigate={handleTodayNavigate}
              />
            </TabPanel>
            <TabPanel active={activeTab === 'my-clients'} mounted={mountedTabs.has('my-clients')}>
              <ClientList coachId={user.id} />
            </TabPanel>
            <TabPanel active={activeTab === 'my-workouts'} mounted={mountedTabs.has('my-workouts')}>
              <WorkoutLibrary coachId={user.id} />
            </TabPanel>
            <TabPanel active={activeTab === 'my-programs'} mounted={mountedTabs.has('my-programs')}>
              <ProgramLibrary coachId={user.id} />
            </TabPanel>
            <TabPanel active={activeTab === 'my-meal-plans'} mounted={mountedTabs.has('my-meal-plans')}>
              <MealPlanLibrary coachId={user.id} />
            </TabPanel>

            <TabPanel
              active={activeTab === 'assigned-workouts'}
              mounted={mountedTabs.has('assigned-workouts')}
            >
              <div className="bg-surface rounded-2xl border border-line p-5 mb-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-subtle mb-3">
                  Coached by
                </p>
                {loadingCoach ? (
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-line/70 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-3 w-32 rounded bg-line/70 animate-pulse" />
                      <div className="h-3 w-44 rounded bg-line/70 animate-pulse" />
                    </div>
                  </div>
                ) : coach ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={coach.full_name} tone="success" />
                    <div>
                      <p className="font-medium text-foreground text-sm">{coach.full_name}</p>
                      <p className="text-xs text-muted">{coach.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Avatar name={profile.full_name} tone="success" />
                    <div>
                      <p className="font-medium text-foreground text-sm">Self-coached</p>
                      <p className="text-xs text-muted">
                        You can assign workouts and meal plans to yourself, or use an invite link to connect with a coach.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <ClientWorkoutView
                clientId={user.id}
                requestedDate={pendingWorkoutDate}
                onRequestedDateConsumed={() => setPendingWorkoutDate(null)}
              />
            </TabPanel>

            <TabPanel
              active={activeTab === 'assigned-meals'}
              mounted={mountedTabs.has('assigned-meals')}
            >
              <ClientMealPlanView clientId={user.id} />
            </TabPanel>
            <TabPanel
              active={activeTab === 'measurements'}
              mounted={mountedTabs.has('measurements')}
            >
              <BodyTracker profile={profile} />
            </TabPanel>
            <TabPanel active={activeTab === 'history'} mounted={mountedTabs.has('history')}>
              <WorkoutHistory clientId={user.id} />
            </TabPanel>
            <TabPanel active={activeTab === 'settings'} mounted={mountedTabs.has('settings')}>
              <SettingsView userId={user.id} email={user.email ?? ''} />
            </TabPanel>
          </div>
        </main>

        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onOpenDrawer={() => setMobileMenuOpen(true)}
        />
      </div>
    </div>
    </RestTimerProvider>
  )
}

/**
 * Renders its children only after the tab has been visited at least once,
 * and keeps them in the DOM thereafter (toggling `display: none`). Lets the
 * dashboard pay each tab's mount + fetch cost exactly one time and serve
 * subsequent switches instantly. Inactive tabs hold their state but don't
 * paint, so they're cheap.
 */
function TabPanel({
  active,
  mounted,
  children,
}: {
  active: boolean
  mounted: boolean
  children: React.ReactNode
}) {
  if (!mounted) return null
  // `tab-content` on the active panel keeps the existing fadeIn animation
  // on first appearance. Subsequent visibility flips don't restart it,
  // which is the right call — instant feels better than animated here.
  return (
    <div
      className={active ? 'tab-content' : 'hidden'}
      aria-hidden={!active}
    >
      {children}
    </div>
  )
}
