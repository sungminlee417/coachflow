'use client'

import { useMemo, useState } from 'react'
import { Scale } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'
import { useLogWeight, useWeightLogs } from '@/lib/hooks/use-weight-logs'
import { daysBetween, formatDate, roundMacro, todayISO } from '@/lib/utils'
import type { WeightLog, WeightUnit } from '@/lib/types'
import { Card, CardSkeletonBody, parseLocalISO, shiftISO } from './primitives'

export function WeightCard({
  userId,
  weightUnit,
  weightGoal,
  onOpen,
}: {
  userId: string
  weightUnit: WeightUnit
  weightGoal: number | null
  onOpen: () => void
}) {
  // Weight reads + log share one TanStack Query cache with the deep
  // WeightTracker — optimistic updates flow through this card without
  // a re-fetch.
  const weightQuery = useWeightLogs(userId)
  const allLogs = weightQuery.data ?? []
  const latest = allLogs[0] ?? null
  // Treat a rehydrated-but-empty cache as still loading until a fresh
  // fetch confirms emptiness — otherwise "No entries" flashes briefly
  // on cold-open. `isStale` covers the gap before `isFetching` flips.
  const logsLoaded =
    weightQuery.isSuccess &&
    !(allLogs.length === 0 && (weightQuery.isFetching || weightQuery.isStale))
  const logWeight = useLogWeight(userId)
  const [draft, setDraft] = useState('')
  const saving = logWeight.isPending

  const today = todayISO()
  const loggedToday = latest?.recorded_at === today

  const daysSince = latest
    ? Math.max(0, daysBetween(latest.recorded_at, today))
    : null

  // "X to go" stamp — only shown when both a goal and a latest weight
  // exist. Doesn't try to infer direction (cut vs bulk); just shows the
  // absolute distance so the trainee sees progress at a glance.
  const goalDiff =
    latest && weightGoal != null && Number.isFinite(weightGoal) && weightGoal > 0
      ? latest.weight - weightGoal
      : null

  const handleLog = () => {
    const weight = parseFloat(draft)
    if (!draft || Number.isNaN(weight) || weight <= 0) {
      showToast('Enter a valid weight', 'error')
      return
    }
    logWeight.mutate(
      { recorded_at: today, weight },
      {
        onSuccess: () => {
          showToast('Weight logged')
          setDraft('')
        },
        onError: () => showToast('Failed to log weight', 'error'),
      }
    )
  }

  return (
    <Card onClick={onOpen} accent="indigo" icon={Scale} label="Weight">
      {!logsLoaded ? (
        <CardSkeletonBody lines={1} />
      ) : (
        <div className="space-y-2.5">
          {/* Vertical stack so the value + unit stay on one line and
              the "logged today" timestamp sits below — at half-width on
              phones the old side-by-side row wrapped "lbs" awkwardly. */}
          <div>
            <p className="font-semibold text-slate-900 leading-none whitespace-nowrap">
              {latest ? (
                <>
                  <span className="text-2xl tabular-nums">
                    {roundMacro(latest.weight)}
                  </span>
                  <span className="text-xs font-normal text-slate-400 ml-1">
                    {weightUnit}
                  </span>
                </>
              ) : (
                <span className="text-slate-400 italic font-normal">
                  No entries
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {latest && (
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {loggedToday
                    ? 'Logged today'
                    : daysSince === 1
                      ? 'Yesterday'
                      : daysSince != null
                        ? `${daysSince}d ago`
                        : formatDate(latest.recorded_at)}
                </p>
              )}
              {goalDiff != null && (
                <span
                  className={`text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 border whitespace-nowrap ${
                    Math.abs(goalDiff) < 0.5
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                  }`}
                >
                  {Math.abs(goalDiff) < 0.5
                    ? 'At goal'
                    : `${roundMacro(Math.abs(goalDiff))} ${weightUnit} to go`}
                </span>
              )}
            </div>
          </div>
          <WeightWeekStrip logs={allLogs} todayISO={today} />
          {!loggedToday && (
            <form
              onSubmit={e => {
                e.preventDefault()
                handleLog()
              }}
              className="grid grid-cols-[1fr_auto] gap-2"
            >
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={`Weight (${weightUnit})`}
                className="text-sm py-2"
              />
              <Button
                type="submit"
                size="sm"
                loading={saving}
                disabled={!draft}
              >
                {saving ? 'Saving…' : 'Log'}
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// Compact 7-day strip — one dot per day (last week → today, left to
// right). Filled indigo if a weight was logged that day, hollow if not.
// Today is ringed so the user can scan whether they've already logged.
// Hover/long-press a filled dot to see the weight via the native title.
function WeightWeekStrip({
  logs,
  todayISO: today,
}: {
  logs: WeightLog[]
  todayISO: string
}) {
  // Build the 7 dates and a per-date lookup of the logged weight.
  const days = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const l of logs) byDate.set(l.recorded_at, l.weight)
    const arr: { date: string; weight: number | null; isToday: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = shiftISO(today, -i)
      arr.push({
        date: d,
        weight: byDate.get(d) ?? null,
        isToday: d === today,
      })
    }
    return arr
  }, [logs, today])

  return (
    <div className="flex items-center justify-between gap-1 pt-1">
      {days.map(d => {
        const dow = parseLocalISO(d.date).toLocaleDateString('en-US', {
          weekday: 'narrow',
        })
        const logged = d.weight != null
        return (
          <div
            key={d.date}
            className="flex flex-col items-center gap-1 min-w-0 flex-1"
            title={
              logged
                ? `${roundMacro(d.weight!)} on ${parseLocalISO(d.date).toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric' }
                  )}`
                : `No entry · ${parseLocalISO(d.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}`
            }
          >
            <span
              className={`block h-2.5 w-2.5 rounded-full ${
                logged
                  ? 'bg-indigo-500'
                  : 'bg-transparent border border-slate-200'
              } ${
                d.isToday
                  ? logged
                    ? 'ring-2 ring-indigo-200 ring-offset-1 ring-offset-white'
                    : 'border-indigo-400 ring-2 ring-indigo-100 ring-offset-1 ring-offset-white'
                  : ''
              }`}
              aria-hidden
            />
            <span
              className={`text-[9px] font-medium tabular-nums ${
                d.isToday ? 'text-indigo-700' : 'text-slate-400'
              }`}
            >
              {dow}
            </span>
          </div>
        )
      })}
    </div>
  )
}
