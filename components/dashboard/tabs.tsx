// Single source of truth for the dashboard's tab catalogue + section
// styling tones. Extracted from UnifiedDashboard so the sidebar, mobile
// drawer, and bottom-bar can all reach the same definitions without
// importing the orchestrator file (and so this metadata is testable in
// isolation).

import {
  ClipboardList,
  Dumbbell,
  History,
  Home,
  Users,
  ListChecks,
  Apple,
  Utensils,
  Ruler,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type Tab =
  | 'today'
  | 'my-clients'
  | 'my-workouts'
  | 'my-programs'
  | 'my-meal-plans'
  | 'assigned-workouts'
  | 'assigned-meals'
  | 'measurements'
  | 'history'
  | 'settings'

// `home` is its own section so the Today hub renders above the coaching
// and training groups in the nav, without an "everything else" section
// header.
export type Section = 'home' | 'coaching' | 'training'

export interface TabDef {
  key: Tab
  label: string
  icon: ReactNode
  section: Section
}

export const TABS: TabDef[] = [
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

// Partitioned at module load — both desktop sidebar and the mobile
// drawer re-render on every state change and filter-on-render would
// produce a fresh array identity each time, defeating child memoization
// down the line.
export const HOME_TABS = TABS.filter(t => t.section === 'home')
export const COACHING_TABS = TABS.filter(t => t.section === 'coaching')
export const TRAINING_TABS = TABS.filter(t => t.section === 'training')

export const SECTION_TONES: Record<Section, { active: string; activeIcon: string; mobileActive: string }> = {
  home: {
    // Slate keeps Today visually neutral — it's the hub, not a side of
    // the coach/trainee duality, so it doesn't borrow either color.
    active: 'bg-elevated text-foreground',
    activeIcon: 'text-foreground',
    mobileActive: 'bg-elevated text-foreground',
  },
  coaching: {
    active: 'bg-indigo-soft text-indigo-fg',
    activeIcon: 'text-indigo-fg',
    mobileActive: 'bg-indigo-soft text-indigo-fg',
  },
  training: {
    active: 'bg-emerald-soft text-emerald-fg',
    activeIcon: 'text-emerald-fg',
    mobileActive: 'bg-emerald-soft text-emerald-fg',
  },
}
