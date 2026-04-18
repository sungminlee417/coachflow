'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { Users, Dumbbell, ClipboardList, History, LogOut } from 'lucide-react'
import ClientList from './ClientList'
import WorkoutLibrary from './WorkoutLibrary'
import ClientWorkoutView from './ClientWorkoutView'
import WorkoutHistory from './WorkoutHistory'

type Tab = 'my-clients' | 'my-workouts' | 'assigned-workouts' | 'history'

interface UnifiedDashboardProps {
  user: User
  profile: any
}

export default function UnifiedDashboard({ user, profile }: UnifiedDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('my-clients')
  const [coach, setCoach] = useState<any>(null)
  const [loadingCoach, setLoadingCoach] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    fetchCoach()
  }, [])

  const fetchCoach = async () => {
    try {
      const { data: relationship } = await supabase
        .from('coach_client_relationships')
        .select('coach_id, profiles(*)')
        .eq('client_id', user.id)
        .eq('status', 'active')
        .single()

      if (relationship) {
        setCoach(relationship.profiles)
      }
    } catch {
    } finally {
      setLoadingCoach(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; section: 'coaching' | 'training' }[] = [
    { key: 'my-clients', label: 'My Clients', icon: <Users size={16} />, section: 'coaching' },
    { key: 'my-workouts', label: 'My Workouts', icon: <Dumbbell size={16} />, section: 'coaching' },
    { key: 'assigned-workouts', label: 'Assigned Workouts', icon: <ClipboardList size={16} />, section: 'training' },
    { key: 'history', label: 'History', icon: <History size={16} />, section: 'training' },
  ]

  const coachingTabs = tabs.filter(t => t.section === 'coaching')
  const trainingTabs = tabs.filter(t => t.section === 'training')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar + Content layout */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200">
          {/* Logo */}
          <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-100">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Dumbbell size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">CoachFlow</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
            {/* Coaching section */}
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Coaching</p>
              <div className="space-y-1">
                {coachingTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      activeTab === tab.key
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={activeTab === tab.key ? 'text-indigo-500' : 'text-slate-400'}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Training section */}
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Training</p>
              <div className="space-y-1">
                {trainingTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      activeTab === tab.key
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={activeTab === tab.key ? 'text-emerald-500' : 'text-slate-400'}>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          {/* User footer */}
          <div className="border-t border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {profile.full_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{profile.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{profile.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                aria-label="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile header */}
        <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-40">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Dumbbell size={14} className="text-white" />
              </div>
              <span className="text-base font-bold text-slate-900 tracking-tight">CoachFlow</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
          <nav className="flex overflow-x-auto px-2 pb-1 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? tab.section === 'coaching'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main content */}
        <main className="flex-1 md:ml-64 pt-[104px] md:pt-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8">
            {activeTab === 'my-clients' && <ClientList coachId={user.id} />}
            {activeTab === 'my-workouts' && <WorkoutLibrary coachId={user.id} />}

            {activeTab === 'assigned-workouts' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-8">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Your Coach</p>
                  {loadingCoach ? (
                    <p className="text-slate-400 text-sm">Loading...</p>
                  ) : coach ? (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-sm font-bold">
                        {coach.full_name?.charAt(0) || 'C'}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{coach.full_name}</p>
                        <p className="text-xs text-slate-500">{coach.email}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">
                      No coach connected yet. Ask a coach to send you an invite link.
                    </p>
                  )}
                </div>
                <ClientWorkoutView clientId={user.id} />
              </>
            )}

            {activeTab === 'history' && <WorkoutHistory clientId={user.id} />}
          </div>
        </main>
      </div>
    </div>
  )
}
