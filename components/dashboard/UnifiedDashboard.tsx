'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { User } from '@supabase/supabase-js'
import { Users, Dumbbell, ClipboardList, History, ListChecks, LogOut, Apple, Utensils, Ruler, Menu, X, Home, Settings as SettingsIcon } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Avatar } from '@/components/ui/Avatar'
import { RestTimerProvider } from '@/components/ui/RestTimer'
import { AuthGuard } from '@/components/ui/AuthGuard'
import { clearPersistedQueryCache } from '@/lib/query-client'
import { ProfileThemeSync } from '@/lib/theme'
import ClientList from '@/components/coaching/ClientList'
import WorkoutLibrary from '@/components/coaching/WorkoutLibrary'
import ProgramLibrary from '@/components/coaching/ProgramLibrary'
import MealPlanLibrary from '@/components/coaching/MealPlanLibrary'
import ClientWorkoutView from '@/components/training/ClientWorkoutView'
import ClientMealPlanView from '@/components/training/ClientMealPlanView'
import WorkoutHistory from '@/components/training/WorkoutHistory'
import BodyTracker from '@/components/training/BodyTracker'
import TodayDashboard, { type TodayNavTarget } from '@/components/training/TodayDashboard'
import SettingsView from '@/components/dashboard/SettingsView'
import type { Profile } from '@/lib/types'

type Tab = 'today' | 'my-clients' | 'my-workouts' | 'my-programs' | 'my-meal-plans' | 'assigned-workouts' | 'assigned-meals' | 'measurements' | 'history' | 'settings'
// `home` is its own section so the Today hub renders above the coaching /
// training groups in the nav, without an "everything else" section header.
type Section = 'home' | 'coaching' | 'training'

interface TabDef {
  key: Tab
  label: string
  icon: React.ReactNode
  section: Section
}

const TABS: TabDef[] = [
  { key: 'today', label: 'Today', icon: <Home size={16} />, section: 'home' },
  { key: 'my-clients', label: 'My Clients', icon: <Users size={16} />, section: 'coaching' },
  { key: 'my-workouts', label: 'My Workouts', icon: <Dumbbell size={16} />, section: 'coaching' },
  { key: 'my-programs', label: 'My Programs', icon: <ListChecks size={16} />, section: 'coaching' },
  { key: 'my-meal-plans', label: 'My Meal Plans', icon: <Apple size={16} />, section: 'coaching' },
  { key: 'assigned-workouts', label: 'Assigned Workouts', icon: <ClipboardList size={16} />, section: 'training' },
  { key: 'assigned-meals', label: 'Assigned Meals', icon: <Utensils size={16} />, section: 'training' },
  { key: 'measurements', label: 'Measurements', icon: <Ruler size={16} />, section: 'training' },
  { key: 'history', label: 'Progress', icon: <History size={16} />, section: 'training' },
]

const sectionTone: Record<Section, { active: string; activeIcon: string; mobileActive: string }> = {
  home: {
    // Slate keeps Today visually neutral — it's the hub, not a side of
    // the coach/trainee duality, so it doesn't borrow either color.
    active: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
    activeIcon: 'text-slate-700 dark:text-slate-300',
    mobileActive: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
  },
  coaching: {
    active: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200',
    activeIcon: 'text-indigo-500 dark:text-indigo-300',
    mobileActive: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200',
  },
  training: {
    active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    activeIcon: 'text-emerald-500 dark:text-emerald-300',
    mobileActive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  },
}

interface UnifiedDashboardProps {
  user: User
  profile: Profile
}

// Default landing tab — the Today hub. A reload always brings the user
// back here. Bookmark `/app` and it's the same experience as a fresh
// sign-in.
const DEFAULT_TAB: Tab = 'today'

// TABS partitioned once at module load — both sidebar nav (desktop) and
// the drawer (mobile) render these on every state change, and filter-on-
// render produces a fresh array reference each time which would defeat
// child memoization down the line.
const HOME_TABS = TABS.filter(t => t.section === 'home')
const COACHING_TABS = TABS.filter(t => t.section === 'coaching')
const TRAINING_TABS = TABS.filter(t => t.section === 'training')

export default function UnifiedDashboard({ user, profile }: UnifiedDashboardProps) {
  const supabase = useSupabase()

  // Pure React state — every fresh session / reload lands on Today, and
  // tab navigation is invisible in the URL. The previous URL-driven
  // approach made sense when there was no home page, but Today is now
  // the canonical landing surface and the URL noise was hurting more
  // than it helped (per the user's UX feedback). Bookmark `/app` and
  // you'll always come back to the hub.
  const [activeTab, setActiveTab] = useState<Tab>(DEFAULT_TAB)

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

  const renderNavButton = (tab: TabDef) => {
    const isActive = activeTab === tab.key
    const tone = sectionTone[tab.section]
    return (
      <button
        key={tab.key}
        onClick={() => {
          setActiveTab(tab.key)
          setMobileMenuOpen(false)
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
          isActive ? tone.active : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
        }`}
      >
        <span className={isActive ? tone.activeIcon : 'text-slate-400'}>{tab.icon}</span>
        {tab.label}
      </button>
    )
  }

  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label ?? ''

  const coachingTabs = COACHING_TABS
  const trainingTabs = TRAINING_TABS

  return (
    <RestTimerProvider userId={user.id}>
    <AuthGuard />
    {/* Pull profile.theme into the in-memory ThemeProvider on mount so
        a theme set on another device flips this device on next load. */}
    <ProfileThemeSync profileTheme={profile.theme} />
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="flex">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700">
          <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-100 dark:border-slate-800">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Dumbbell size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">CoachFlow</span>
          </div>

          <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
            <div className="space-y-1">
              {HOME_TABS.map(t => renderNavButton(t))}
            </div>
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                Coaching
              </p>
              <div className="space-y-1">{coachingTabs.map(t => renderNavButton(t))}</div>
            </div>
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                Training
              </p>
              <div className="space-y-1">{trainingTabs.map(t => renderNavButton(t))}</div>
            </div>
          </nav>

          <div className="border-t border-slate-100 dark:border-slate-800 p-4 flex items-center gap-3">
            <Avatar name={profile.full_name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{profile.full_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{profile.email}</p>
            </div>
            <IconButton
              onClick={() => {
                setActiveTab('settings')
                setMobileMenuOpen(false)
              }}
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
        <div className="md:hidden fixed top-0 left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 z-40">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Dumbbell size={14} className="text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
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
            className={`md:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 z-50 flex flex-col shadow-xl transition-transform duration-200 ease-out ${
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            role="dialog"
            aria-label="Navigation menu"
            aria-hidden={!mobileMenuOpen}
          >
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <Dumbbell size={16} className="text-white" />
                  </div>
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">CoachFlow</span>
                </div>
                <IconButton
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X size={18} />
                </IconButton>
              </div>

              <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
                <div className="space-y-1">
                  {HOME_TABS.map(t => renderNavButton(t))}
                </div>
                <div>
                  <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    Coaching
                  </p>
                  <div className="space-y-1">{coachingTabs.map(t => renderNavButton(t))}</div>
                </div>
                <div>
                  <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    Training
                  </p>
                  <div className="space-y-1">{trainingTabs.map(t => renderNavButton(t))}</div>
                </div>
                <div>
                  <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    Account
                  </p>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('settings')
                        setMobileMenuOpen(false)
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        activeTab === 'settings'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      <span
                        className={
                          activeTab === 'settings' ? 'text-slate-700' : 'text-slate-400'
                        }
                      >
                        <SettingsIcon size={16} />
                      </span>
                      Settings
                    </button>
                  </div>
                </div>
              </nav>

              <div className="border-t border-slate-100 dark:border-slate-800 p-4 flex items-center gap-3">
                <Avatar name={profile.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{profile.full_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{profile.email}</p>
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
                onNavigate={(target: TodayNavTarget) => setActiveTab(target)}
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
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
                  Coached by
                </p>
                {loadingCoach ? (
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-200/70 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-3 w-32 rounded bg-slate-200/70 animate-pulse" />
                      <div className="h-3 w-44 rounded bg-slate-200/70 animate-pulse" />
                    </div>
                  </div>
                ) : coach ? (
                  <div className="flex items-center gap-3">
                    <Avatar name={coach.full_name} tone="success" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{coach.full_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{coach.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Avatar name={profile.full_name} tone="success" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">Self-coached</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        You can assign workouts and meal plans to yourself, or use an invite link to connect with a coach.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <ClientWorkoutView clientId={user.id} />
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

        {/* Mobile bottom tab bar — primary nav on phones. The drawer (via the
            "More" tab) holds coaching tabs + history. Hidden on desktop where
            the sidebar already covers everything. */}
        <nav
          className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 grid grid-cols-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Primary"
        >
          {(
            [
              { key: 'today' as Tab, label: 'Today', icon: <Home size={20} /> },
              { key: 'assigned-workouts' as Tab, label: 'Workouts', icon: <ClipboardList size={20} /> },
              { key: 'assigned-meals' as Tab, label: 'Meals', icon: <Utensils size={20} /> },
            ]
          ).map(item => {
            const isActive = activeTab === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                  isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          })}
          {(() => {
            // "More" is active when activeTab isn't one of the three primary
            // mobile destinations above. Body/measurements lives in the
            // drawer now (Today displaces it from the bottom bar), so
            // Measurements lights up More too.
            const moreActive = !(
              activeTab === 'today' ||
              activeTab === 'assigned-workouts' ||
              activeTab === 'assigned-meals'
            )
            return (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-current={moreActive ? 'page' : undefined}
                aria-haspopup="menu"
                className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                  moreActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Menu size={20} />
                <span className="text-[10px] font-medium">More</span>
              </button>
            )
          })()}
        </nav>
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
