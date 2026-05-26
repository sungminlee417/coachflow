'use client'

// Shared building blocks for the Today dashboard cards. Pulled out of
// the parent so each individual card file stays focused on its data +
// render and shares a single visual language.

import type { Dumbbell } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

export const ACCENTS = {
  // `card-tint-{accent}` paints surface + a soft accent wash in one
  // class (defined in globals.css via @utility). Both colors resolve
  // from CSS variables, so the theme swap is automatic.
  emerald: {
    iconBg: 'bg-emerald-strong text-emerald-fg',
    cardBg: 'card-tint-emerald',
    border: 'border-emerald-line hover:border-emerald-fg',
    progress: 'bg-emerald-500',
  },
  amber: {
    iconBg: 'bg-amber-strong text-amber-fg',
    cardBg: 'card-tint-amber',
    border: 'border-amber-line hover:border-amber-fg',
    progress: 'bg-amber-500',
  },
  indigo: {
    iconBg: 'bg-indigo-strong text-indigo-fg',
    cardBg: 'card-tint-indigo',
    border: 'border-indigo-line hover:border-indigo-fg',
    progress: 'bg-indigo-500',
  },
  purple: {
    iconBg: 'bg-purple-strong text-purple-fg',
    cardBg: 'card-tint-purple',
    border: 'border-purple-line hover:border-purple-fg',
    progress: 'bg-purple-500',
  },
} as const

export type Accent = keyof typeof ACCENTS

export const PILL_TONES = {
  amber: 'bg-amber-soft text-amber-fg-strong border-amber-line',
  emerald: 'bg-emerald-soft text-emerald-fg-strong border-emerald-line',
  indigo: 'bg-indigo-soft text-indigo-fg-strong border-indigo-line',
  purple: 'bg-purple-soft text-purple-fg-strong border-purple-line',
} as const

export type PillTone = keyof typeof PILL_TONES

/** Tab keys the Today dashboard can hop into. Mirrored in
 *  UnifiedDashboard's Tab union — kept narrow so card props are typed. */
export type TodayNavTarget =
  | 'assigned-workouts'
  | 'assigned-meals'
  | 'measurements'
  | 'history'
  | 'my-clients'
  | 'my-workouts'
  | 'my-programs'
  | 'my-meal-plans'

/** Optional payload carried with a navigation. Today, only the workout
 *  view consumes a `date`, but the shape is generic so other cards can
 *  add context without a signature change. */
export interface TodayNavOptions {
  date?: string
}

export function Card({
  icon: Icon,
  label,
  accent,
  onClick,
  children,
}: {
  icon: typeof Dumbbell
  label: string
  accent: Accent
  onClick: () => void
  children: React.ReactNode
}) {
  // Container is a div so nested interactive elements (toggles, mini-
  // log forms) don't violate the HTML rule against button-in-button.
  // The "navigate to the full view" affordance is a small button in the
  // top-right corner instead, with an explicit aria-label.
  const a = ACCENTS[accent]
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all h-full ${a.cardBg} ${a.border}`}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={`h-9 w-9 rounded-xl flex items-center justify-center ${a.iconBg}`}
        >
          <Icon size={16} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
          {label}
        </span>
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${label}`}
          className="ml-auto h-7 w-7 rounded-md flex items-center justify-center text-subtle hover:text-foreground hover:bg-surface/70 transition-colors cursor-pointer"
        >
          <ArrowRight size={14} />
        </button>
      </div>
      {children}
    </div>
  )
}

export function ProgressBar({
  value,
  total,
  tone,
}: {
  value: number
  total: number
  tone: Accent
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden">
      <div
        className={`h-full ${ACCENTS[tone].progress} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function CardSkeletonBody({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-line/70 rounded animate-pulse"
          style={{ width: `${[80, 60, 70, 50][i % 4]}%` }}
        />
      ))}
    </div>
  )
}

export function CardEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Dumbbell
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={18} className="text-faint mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-subtle px-1">
      {title}
    </h3>
  )
}

export function Pill({
  icon,
  label,
  tone,
}: {
  icon: string
  label: string
  tone: PillTone
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums border ${PILL_TONES[tone]}`}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  )
}

// `parseLocalISO` isn't exported from utils — small local version that
// parses YYYY-MM-DD at local midnight (avoids the `new Date(s)` UTC
// off-by-one trap).
export function parseLocalISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// `lib/utils.ts` already exports `shiftDateISO` — local alias keeps the
// streak loop readable.
export function shiftISO(dateISO: string, days: number): string {
  const d = parseLocalISO(dateISO)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function greetingForHour(h: number) {
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}
