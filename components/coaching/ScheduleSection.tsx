'use client'

import { Input } from '@/components/ui/Input'
import { DayOfWeekSelector } from '@/components/ui/DayOfWeekSelector'
import type { DayOfWeek } from '@/lib/types'

export type ScheduleMode = 'weekly' | 'cycle'

interface ScheduleSectionProps {
  scheduleMode: ScheduleMode
  setScheduleMode: (mode: ScheduleMode) => void
  daysOfWeek: DayOfWeek[]
  setDaysOfWeek: (days: DayOfWeek[]) => void
  cycleLength: number
  setCycleLength: (length: number) => void
  cyclePosition: number
  setCyclePosition: (position: number) => void
}

/**
 * Schedule picker shared by the workout builder. Two modes:
 *   - Weekly: pick days-of-week the workout runs.
 *   - N-day rotation: cycle length + position for non-weekly splits.
 *
 * Owns no state of its own — parent state is the source of truth so the dirty
 * tracker and save flow stay in one place.
 */
export function ScheduleSection({
  scheduleMode,
  setScheduleMode,
  daysOfWeek,
  setDaysOfWeek,
  cycleLength,
  setCycleLength,
  cyclePosition,
  setCyclePosition,
}: ScheduleSectionProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Schedule</label>
      <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 mb-3 bg-slate-50 dark:bg-slate-800">
        {(
          [
            { value: 'weekly', label: 'Weekly' },
            { value: 'cycle', label: 'N-day rotation' },
          ] as const
        ).map(({ value, label }) => {
          const active = scheduleMode === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setScheduleMode(value)}
              aria-pressed={active}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                active ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {scheduleMode === 'weekly' ? (
        <>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
            Leave days empty to show this workout every day.
          </p>
          <DayOfWeekSelector value={daysOfWeek} onChange={setDaysOfWeek} />
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            For rotations that don&rsquo;t fit a 7-day week. The workout shows on its
            position once every <span className="font-medium">{cycleLength}</span> days.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Rotation length</label>
              <Input
                type="number"
                min="1"
                max="60"
                step="1"
                value={cycleLength}
                onChange={e => {
                  const n = Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1)))
                  setCycleLength(n)
                  // Clamp position so it's never out of range.
                  if (cyclePosition > n) setCyclePosition(n)
                }}
                placeholder="8"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Position (1–{cycleLength})
              </label>
              <Input
                type="number"
                min="1"
                max={cycleLength}
                step="1"
                value={cyclePosition}
                onChange={e => {
                  const n = Math.max(
                    1,
                    Math.min(cycleLength, Math.floor(Number(e.target.value) || 1))
                  )
                  setCyclePosition(n)
                }}
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Day {cyclePosition} of a {cycleLength}-day rotation. When you assign this
            workout, you&rsquo;ll pick the date that&rsquo;s Day 1.
          </p>
        </div>
      )}
    </div>
  )
}
