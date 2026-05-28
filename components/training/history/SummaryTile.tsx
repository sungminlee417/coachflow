'use client'

// Coloured stat tile rendered in the Progress summary row (This week /
// This month / All-time / Sets logged). Pulled out of WorkoutHistory so
// the page stays focused on data aggregation and other surfaces (e.g.
// the coach-side Progress view if/when it exists) can reuse the chrome.

interface SummaryTileProps {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone: 'indigo' | 'emerald' | 'purple' | 'amber'
}

const TONE_CLASSES: Record<SummaryTileProps['tone'], string> = {
  indigo: 'bg-indigo-soft text-indigo-fg border-indigo-line',
  emerald: 'bg-emerald-soft text-emerald-fg border-emerald-line',
  purple: 'bg-purple-soft text-purple-fg border-purple-line',
  amber: 'bg-amber-soft text-amber-fg border-amber-line',
}

export function SummaryTile({ icon, label, value, sub, tone }: SummaryTileProps) {
  return (
    <div className="bg-surface rounded-xl border border-line p-4">
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest border ${TONE_CLASSES[tone]}`}
      >
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums mt-2">{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  )
}
