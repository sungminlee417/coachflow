'use client'

// Fixed mobile bottom tab bar — the trainee's primary nav on phones.
// Holds Today / Workouts / Meals as direct destinations and pops the
// full drawer for everything else via the "More" slot. Hidden on
// desktop (the sidebar covers the same ground).

import { ClipboardList, Home, Menu, Utensils } from 'lucide-react'
import type { Tab } from './tabs'

interface MobileBottomNavProps {
  activeTab: Tab
  onSelectTab: (tab: Tab) => void
  onOpenDrawer: () => void
}

const PRIMARY_ITEMS: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
  { key: 'today', label: 'Today', icon: <Home size={20} /> },
  { key: 'assigned-workouts', label: 'Workouts', icon: <ClipboardList size={20} /> },
  { key: 'assigned-meals', label: 'Meals', icon: <Utensils size={20} /> },
]

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  onOpenDrawer,
}: MobileBottomNavProps) {
  // "More" lights up whenever we're outside the three primary slots —
  // measurements, history, settings, etc. all live in the drawer.
  const moreActive = !PRIMARY_ITEMS.some(item => item.key === activeTab)

  return (
    <nav
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-surface border-t border-line grid grid-cols-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      {PRIMARY_ITEMS.map(item => {
        const isActive = activeTab === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelectTab(item.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              isActive ? 'text-emerald-fg' : 'text-muted hover:text-foreground'
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-current={moreActive ? 'page' : undefined}
        aria-haspopup="menu"
        className={`h-14 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
          moreActive ? 'text-indigo-fg' : 'text-muted hover:text-foreground'
        }`}
      >
        <Menu size={20} />
        <span className="text-[10px] font-medium">More</span>
      </button>
    </nav>
  )
}
