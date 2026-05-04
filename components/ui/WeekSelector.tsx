'use client'

import { DAY_NAMES, dayOfMonthOf, getWeekDates, todayISO } from '@/lib/utils'

type Tone = 'brand' | 'success'

interface WeekSelectorProps {
  selectedDate: string
  onSelect: (date: string) => void
  tone?: Tone
}

const toneClasses = {
  brand: {
    selected: 'bg-indigo-600 text-white',
    today: 'bg-indigo-100 text-indigo-900',
  },
  success: {
    selected: 'bg-emerald-600 text-white',
    today: 'bg-emerald-100 text-emerald-900',
  },
}

export function WeekSelector({ selectedDate, onSelect, tone = 'brand' }: WeekSelectorProps) {
  const weekDates = getWeekDates(selectedDate)
  const today = todayISO()
  const tones = toneClasses[tone]

  return (
    <div className="grid grid-cols-7 gap-2 mb-6">
      {weekDates.map((date, index) => {
        const isSelected = date === selectedDate
        const isToday = date === today
        const day = dayOfMonthOf(date)

        return (
          <button
            key={date}
            onClick={() => onSelect(date)}
            className={`p-3 rounded-lg text-center transition-colors cursor-pointer ${
              isSelected
                ? tones.selected
                : isToday
                ? tones.today
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <div className="text-xs font-medium">{DAY_NAMES[index]}</div>
            <div className="text-lg font-bold">{day}</div>
          </button>
        )
      })}
    </div>
  )
}
