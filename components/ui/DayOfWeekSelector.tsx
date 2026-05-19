'use client'

import type { DayOfWeek } from '@/lib/types'

const DAYS: { value: DayOfWeek; short: string; full: string }[] = [
  { value: 1, short: 'M', full: 'Monday' },
  { value: 2, short: 'T', full: 'Tuesday' },
  { value: 3, short: 'W', full: 'Wednesday' },
  { value: 4, short: 'T', full: 'Thursday' },
  { value: 5, short: 'F', full: 'Friday' },
  { value: 6, short: 'S', full: 'Saturday' },
  { value: 0, short: 'S', full: 'Sunday' },
]

interface DayOfWeekSelectorProps {
  value: DayOfWeek[]
  onChange: (days: DayOfWeek[]) => void
}

export function DayOfWeekSelector({ value, onChange }: DayOfWeekSelectorProps) {
  const toggle = (day: DayOfWeek) => {
    onChange(
      value.includes(day) ? value.filter(d => d !== day) : [...value, day].sort()
    )
  }

  const allSelected = value.length === 7

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {DAYS.map(d => {
        const active = value.includes(d.value)
        return (
          <button
            key={d.value}
            type="button"
            onClick={() => toggle(d.value)}
            aria-label={d.full}
            aria-pressed={active}
            title={d.full}
            className={`h-8 w-8 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
              active
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {d.short}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => onChange(allSelected ? [] : ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]))}
        className="ml-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer underline-offset-2 hover:underline"
      >
        {allSelected ? 'Clear' : 'Every day'}
      </button>
    </div>
  )
}
