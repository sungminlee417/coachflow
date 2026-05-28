'use client'

// The Home / Coaching / Training nav body rendered both in the desktop
// sidebar and the mobile slide-in drawer. They used to be two near-
// identical blocks (~50 lines each); consolidating means a new section
// or section-tone tweak lands in one place instead of two.
//
// `includeSettings` adds the mobile drawer's "Account → Settings" row.
// Desktop has its own Settings IconButton in the footer and skips it.

import { Settings as SettingsIcon } from 'lucide-react'
import type { Tab, TabDef, Section } from './tabs'
import { HOME_TABS, COACHING_TABS, TRAINING_TABS, SECTION_TONES } from './tabs'

interface NavSectionListProps {
  activeTab: Tab
  onSelect: (tab: Tab) => void
  /** Mobile-only: render the Account/Settings row inline at the bottom
   *  of the nav. Desktop puts Settings on the footer chrome instead. */
  includeSettings?: boolean
}

export function NavSectionList({
  activeTab,
  onSelect,
  includeSettings = false,
}: NavSectionListProps) {
  return (
    <nav className="flex-1 px-3 py-6 space-y-6 overflow-y-auto">
      <div className="space-y-1">
        {HOME_TABS.map(t => (
          <NavButton key={t.key} tab={t} activeTab={activeTab} onSelect={onSelect} />
        ))}
      </div>
      <NavSection title="Coaching" tabs={COACHING_TABS} activeTab={activeTab} onSelect={onSelect} />
      <NavSection title="Training" tabs={TRAINING_TABS} activeTab={activeTab} onSelect={onSelect} />
      {includeSettings && (
        <div>
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-subtle mb-2">
            Account
          </p>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => onSelect('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-elevated text-foreground'
                  : 'text-muted hover:bg-elevated hover:text-foreground'
              }`}
            >
              <span
                className={activeTab === 'settings' ? 'text-foreground' : 'text-subtle'}
              >
                <SettingsIcon size={16} />
              </span>
              Settings
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}

function NavSection({
  title,
  tabs,
  activeTab,
  onSelect,
}: {
  title: string
  tabs: TabDef[]
  activeTab: Tab
  onSelect: (tab: Tab) => void
}) {
  return (
    <div>
      <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-subtle mb-2">
        {title}
      </p>
      <div className="space-y-1">
        {tabs.map(t => (
          <NavButton key={t.key} tab={t} activeTab={activeTab} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function NavButton({
  tab,
  activeTab,
  onSelect,
}: {
  tab: TabDef
  activeTab: Tab
  onSelect: (tab: Tab) => void
}) {
  const isActive = activeTab === tab.key
  const tone: Section = tab.section
  const toneClasses = SECTION_TONES[tone]
  return (
    <button
      onClick={() => onSelect(tab.key)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
        isActive ? toneClasses.active : 'text-muted hover:bg-elevated hover:text-foreground'
      }`}
    >
      <span className={isActive ? toneClasses.activeIcon : 'text-subtle'}>{tab.icon}</span>
      {tab.label}
    </button>
  )
}
