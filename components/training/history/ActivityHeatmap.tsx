'use client'

// 12-week activity heatmap, GitHub-style. Each column is a week, rows
// are days of the week (Sun..Sat). Filled cells = at least one set
// logged that day; today gets an extra ring so the user can find it.
//
// Sized to fit a 360px phone: 12 cols × 14px + gaps ≈ 220px. Day-of-
// week labels collapse to single letters on mobile, full names on sm+.

import { shiftDateISO, todayISO } from '@/lib/utils'

const WEEKS = 12

export function ActivityHeatmap({ loggedDates }: { loggedDates: Set<string> }) {
  const today = todayISO()
  // Anchor the trailing week to the most recent Saturday (end of the
  // current week in Sun-first convention) so the latest column doesn't
  // visually float — fitness apps tend to align around weekly cycles.
  const todayDate = new Date(today + 'T00:00:00')
  const daysUntilSat = (6 - todayDate.getDay() + 7) % 7
  const anchorISO = shiftDateISO(today, daysUntilSat)
  // Build week columns: each column is 7 day cells (Sun-Sat).
  const columns: Array<{ date: string; logged: boolean; isToday: boolean }[]> = []
  for (let w = WEEKS - 1; w >= 0; w--) {
    const col: { date: string; logged: boolean; isToday: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      // anchorISO is a Saturday; walk back to Sunday-of-that-week then forward.
      const offsetFromAnchor = -w * 7 - (6 - d)
      const dateISO = shiftDateISO(anchorISO, offsetFromAnchor)
      col.push({
        date: dateISO,
        logged: loggedDates.has(dateISO),
        isToday: dateISO === today,
      })
    }
    columns.push(col)
  }

  // Month labels above the grid — show whenever a week's Sunday lands
  // on or just after the 1st of a month, so the header reads naturally.
  const monthLabels = columns.map(col => {
    const sun = col[0]
    const d = new Date(sun.date + 'T00:00:00')
    return d.getDate() <= 7
      ? d.toLocaleDateString('en-US', { month: 'short' })
      : ''
  })

  return (
    <div className="bg-surface rounded-xl border border-line p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <p className="text-[10px] text-subtle">Last 12 weeks</p>
      </div>
      <div className="flex gap-1.5">
        {/* Day-of-week label column. Sunday at top to match the grid. */}
        <div className="hidden sm:flex flex-col justify-between text-[9px] text-subtle pr-1 py-px">
          <span>Sun</span>
          <span>Tue</span>
          <span>Thu</span>
          <span>Sat</span>
        </div>
        <div className="flex-1">
          <div className="flex gap-1">
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-1 flex-1">
                {col.map(cell => (
                  <div
                    key={cell.date}
                    title={`${
                      cell.logged ? 'Logged' : 'No activity'
                    } · ${new Date(cell.date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}`}
                    className={`aspect-square rounded-[3px] ${
                      cell.logged ? 'bg-emerald-500' : 'bg-elevated'
                    } ${
                      cell.isToday
                        ? 'ring-2 ring-emerald-300 ring-offset-1 ring-offset-white'
                        : ''
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* Month labels under each column, only printed when a new
              month starts within that week. */}
          <div className="flex gap-1 mt-1.5">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="text-[9px] text-subtle flex-1 text-center tabular-nums"
              >
                {m}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
