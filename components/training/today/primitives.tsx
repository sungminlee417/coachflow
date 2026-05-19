'use client'

// Shared building blocks for the Today dashboard cards. Pulled out of
// the parent so each individual card file stays focused on its data +
// render and shares a single visual language.

import type { Dumbbell } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

export const ACCENTS = {
  emerald: {
    iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    // Soft tint behind the card body so the dashboard isn't a wall of
    // identical white rectangles. In light mode it's a tiny gradient
    // from a tinted top to white. In dark mode the dark accent tint
    // sits on the dark card surface (slate-900) so the gradient
    // direction inverts — accent stays at the top, slate-900 below.
    cardBg:
      'bg-gradient-to-br from-emerald-50/70 via-white to-white ' +
      'dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900',
    border: 'border-emerald-100/80 hover:border-emerald-300 dark:border-emerald-900/60 dark:hover:border-emerald-700',
    progress: 'bg-emerald-500',
  },
  amber: {
    iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    cardBg:
      'bg-gradient-to-br from-amber-50/70 via-white to-white ' +
      'dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-900',
    border: 'border-amber-100/80 hover:border-amber-300 dark:border-amber-900/60 dark:hover:border-amber-700',
    progress: 'bg-amber-500',
  },
  indigo: {
    iconBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
    cardBg:
      'bg-gradient-to-br from-indigo-50/70 via-white to-white ' +
      'dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900',
    border: 'border-indigo-100/80 hover:border-indigo-300 dark:border-indigo-900/60 dark:hover:border-indigo-700',
    progress: 'bg-indigo-500',
  },
  purple: {
    iconBg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    cardBg:
      'bg-gradient-to-br from-purple-50/70 via-white to-white ' +
      'dark:from-purple-950/40 dark:via-slate-900 dark:to-slate-900',
    border: 'border-purple-100/80 hover:border-purple-300 dark:border-purple-900/60 dark:hover:border-purple-700',
    progress: 'bg-purple-500',
  },
} as const

export type Accent = keyof typeof ACCENTS

export const PILL_TONES = {
  amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800',
  indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-200 dark:border-indigo-800',
  purple: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/30 dark:text-purple-200 dark:border-purple-800',
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
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${label}`}
          className="ml-auto h-7 w-7 rounded-md flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/70 transition-colors cursor-pointer"
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
    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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
          className="h-3 bg-slate-200/70 rounded animate-pulse"
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
      <Icon size={18} className="text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1">
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
