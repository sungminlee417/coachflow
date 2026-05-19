'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DAY_NAMES,
  dayOfMonthOf,
  formatDate,
  getWeekDates,
  shiftDateISO,
  todayISO,
} from '@/lib/utils'

type Tone = 'brand' | 'success'

interface WeekSelectorProps {
  selectedDate: string
  onSelect: (date: string) => void
  tone?: Tone
}

const toneClasses = {
  brand: {
    selected: 'bg-indigo-600 text-white',
    today: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200',
    accent: 'text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200',
  },
  success: {
    selected: 'bg-emerald-600 text-white',
    today: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
    accent: 'text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200',
  },
}

export function WeekSelector({ selectedDate, onSelect, tone = 'brand' }: WeekSelectorProps) {
  const weekDates = getWeekDates(selectedDate)
  const today = todayISO()
  const tones = toneClasses[tone]

  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]
  const isThisWeek = weekDates.includes(today)
  const rangeLabel = `${formatDate(weekStart, { month: 'short', day: 'numeric' })} – ${formatDate(
    weekEnd,
    { month: 'short', day: 'numeric' }
  )}`

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          onClick={() => onSelect(shiftDateISO(selectedDate, -7))}
          aria-label="Previous week"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums truncate">
            {rangeLabel}
          </span>
          {!isThisWeek && (
            <button
              type="button"
              onClick={() => onSelect(today)}
              className={`text-[10px] font-semibold uppercase tracking-widest cursor-pointer ${tones.accent}`}
            >
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSelect(shiftDateISO(selectedDate, 7))}
          aria-label="Next week"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {/* Tighter gap + horizontal padding on mobile so 3-letter day names
          like "Wed" aren't pressed against the cell edges. Vertical padding
          and font sizes stay roughly the same so the tap target doesn't
          shrink — Apple's 44pt recommendation is preserved on desktop and
          the mobile cell still clears ~44pt with `py-2.5`. */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {weekDates.map((date, index) => {
          const isSelected = date === selectedDate
          const isToday = date === today
          const day = dayOfMonthOf(date)

          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              className={`px-1 py-2.5 sm:p-3 rounded-lg text-center transition-colors cursor-pointer ${
                isSelected
                  ? tones.selected
                  : isToday
                    ? tones.today
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <div className="text-[10px] sm:text-xs font-medium">{DAY_NAMES[index]}</div>
              <div className="text-base sm:text-lg font-bold tabular-nums">{day}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
