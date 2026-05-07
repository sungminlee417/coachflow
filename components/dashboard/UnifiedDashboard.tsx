'use client'

import { useCallback, useState, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSupabase } from '@/lib/use-supabase'
import { User } from '@supabase/supabase-js'
import { Users, Dumbbell, ClipboardList, History, ListChecks, LogOut, Apple, Utensils, Ruler, Menu, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Avatar } from '@/components/ui/Avatar'
import { RestTimerProvider } from '@/components/ui/RestTimer'
import ClientList from '@/components/coaching/ClientList'
import WorkoutLibrary from '@/components/coaching/WorkoutLibrary'
import ProgramLibrary from '@/components/coaching/ProgramLibrary'
import MealPlanLibrary from '@/components/coaching/MealPlanLibrary'
import ClientWorkoutView from '@/components/training/ClientWorkoutView'
import ClientMealPlanView from '@/components/training/ClientMealPlanView'
import WorkoutHistory from '@/components/training/WorkoutHistory'
import BodyTracker from '@/components/training/BodyTracker'
import type { Profile } from '@/lib/types'

type Tab = 'my-clients' | 'my-workouts' | 'my-programs' | 'my-meal-plans' | 'assigned-workouts' | 'assigned-meals' | 'measurements' | 'history'
type Section = 'coaching' | 'training'

interface TabDef {
  key: Tab
  label: string
  icon: React.ReactNode
  section: Section
}

const TABS: TabDef[] = [
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
  coaching: {
    active: 'bg-indigo-50 text-indigo-700',
    activeIcon: 'text-indigo-500',
    mobileActive: 'bg-indigo-50 text-indigo-700',
  },
  training: {
    active: 'bg-emerald-50 text-emerald-700',
    activeIcon: 'text-emerald-500',
    mobileActive: 'bg-emerald-50 text-emerald-700',
  },
}

interface UnifiedDashboardProps {
  user: User
  profile: Profile
}

const TAB_KEY_SET = new Set<string>(TABS.map(t => t.key))
const DEFAULT_TAB: Tab = 'my-clients'
const isValidTab = (k: string | null): k is Tab => k != null && TAB_KEY_SET.has(k)

export default function UnifiedDashboard({ user, profile }: UnifiedDashboardProps) {
  const supabase = useSupabase()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Active tab is derived from `?tab=...` so reloads, deep links, and
  // back/forward all preserve which section the user was on.
  const tabParam = searchParams.get('tab')
  const activeTab: Tab = isValidTab(tabParam) ? tabParam : DEFAULT_TAB

  const setActiveTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', next)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const [coach, setCoach] = useState<Profile | null>(null)
  const [loadingCoach, setLoadingCoach] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
          isActive ? tone.active : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <span className={isActive ? tone.activeIcon : 'text-slate-400'}>{tab.icon}</span>
        {tab.label}
      </button>
    )
  }

  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label ?? ''

  const coachingTabs = TABS.filter(t => t.section === 'coaching')
  const trainingTabs = TABS.filter(t => t.section === 'training')

  return (
    <RestTimerProvider>
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200">
          <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-100">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Dumbbell size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">CoachFlow</span>
          </div>

          <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Coaching
              </p>
              <div className="space-y-1">{coachingTabs.map(t => renderNavButton(t))}</div>
            </div>
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Training
              </p>
              <div className="space-y-1">{trainingTabs.map(t => renderNavButton(t))}</div>
            </div>
          </nav>

          <div className="border-t border-slate-100 p-4 flex items-center gap-3">
            <Avatar name={profile.full_name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{profile.full_name}</p>
              <p className="text-xs text-slate-500 truncate">{profile.email}</p>
            </div>
            <IconButton onClick={handleLogout} aria-label="Logout">
              <LogOut size={16} />
            </IconButton>
          </div>
        </aside>

        {/* Mobile header — title only. Navigation is the bottom tab bar +
            "More" drawer; the old top hamburger is gone. */}
        <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-40">
          <div className="flex items-center gap-2.5 px-4 h-14">
            <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Dumbbell size={14} className="text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900 truncate">
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
            className={`md:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white border-r border-slate-200 z-50 flex flex-col shadow-xl transition-transform duration-200 ease-out ${
              mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            role="dialog"
            aria-label="Navigation menu"
            aria-hidden={!mobileMenuOpen}
          >
              <div className="h-14 flex items-center justify-between px-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <Dumbbell size={16} className="text-white" />
                  </div>
                  <span className="text-lg font-bold text-slate-900 tracking-tight">CoachFlow</span>
                </div>
                <IconButton
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X size={18} />
                </IconButton>
              </div>

              <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
                <div>
                  <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Coaching
                  </p>
                  <div className="space-y-1">{coachingTabs.map(t => renderNavButton(t))}</div>
                </div>
                <div>
                  <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Training
                  </p>
                  <div className="space-y-1">{trainingTabs.map(t => renderNavButton(t))}</div>
                </div>
              </nav>

              <div className="border-t border-slate-100 p-4 flex items-center gap-3">
                <Avatar name={profile.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{profile.full_name}</p>
                  <p className="text-xs text-slate-500 truncate">{profile.email}</p>
                </div>
                <IconButton onClick={handleLogout} aria-label="Logout">
                  <LogOut size={16} />
                </IconButton>
              </div>
          </aside>
        </>

        {/* Main content. Bottom padding leaves room for the mobile tab bar. */}
        <main className="flex-1 min-w-0 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-0">
          <div key={activeTab} className="tab-content max-w-5xl mx-auto px-4 sm:px-8 py-8">
            {activeTab === 'my-clients' && <ClientList coachId={user.id} />}
            {activeTab === 'my-workouts' && <WorkoutLibrary coachId={user.id} />}
            {activeTab === 'my-programs' && <ProgramLibrary coachId={user.id} />}
            {activeTab === 'my-meal-plans' && <MealPlanLibrary coachId={user.id} />}

            {activeTab === 'assigned-workouts' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-8">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
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
                        <p className="font-medium text-slate-900 text-sm">{coach.full_name}</p>
                        <p className="text-xs text-slate-500">{coach.email}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Avatar name={profile.full_name} tone="success" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Self-coached</p>
                        <p className="text-xs text-slate-500">
                          You can assign workouts and meal plans to yourself, or use an invite link to connect with a coach.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <ClientWorkoutView clientId={user.id} />
              </>
            )}

            {activeTab === 'assigned-meals' && <ClientMealPlanView clientId={user.id} />}
            {activeTab === 'measurements' && <BodyTracker profile={profile} />}
            {activeTab === 'history' && <WorkoutHistory clientId={user.id} />}
          </div>
        </main>

        {/* Mobile bottom tab bar — primary nav on phones. The drawer (via the
            "More" tab) holds coaching tabs + history. Hidden on desktop where
            the sidebar already covers everything. */}
        <nav
          className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-white border-t border-slate-200 grid grid-cols-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Primary"
        >
          {(
            [
              { key: 'assigned-workouts' as Tab, label: 'Workouts', icon: <ClipboardList size={20} /> },
              { key: 'assigned-meals' as Tab, label: 'Meals', icon: <Utensils size={20} /> },
              { key: 'measurements' as Tab, label: 'Body', icon: <Ruler size={20} /> },
            ]
          ).map(item => {
            const isActive = activeTab === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 cursor-pointer transition-colors ${
                  isActive ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          })}
          {(() => {
            // "More" is active when activeTab isn't one of the three primary
            // mobile destinations above.
            const moreActive = !(
              activeTab === 'assigned-workouts' ||
              activeTab === 'assigned-meals' ||
              activeTab === 'measurements'
            )
            return (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-current={moreActive ? 'page' : undefined}
                aria-haspopup="menu"
                className={`flex flex-col items-center justify-center gap-0.5 py-2 cursor-pointer transition-colors ${
                  moreActive ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-900'
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
