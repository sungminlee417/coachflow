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
  // Inline BF% on the Today card stays opt-in via a disclosure — most
  // weigh-ins are just the number on the scale, and tossing an extra
  // input into the row pushes the primary control off a phone width.
  const [showBfp, setShowBfp] = useState(false)
  const [bfpDraft, setBfpDraft] = useState('')
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
    // BF% is optional and only submitted when the disclosure is open AND
    // the field has a real number. Out-of-band values block the submit
    // entirely so a fat-finger doesn't silently get stored.
    let bfp: number | null | undefined = undefined
    if (showBfp && bfpDraft !== '') {
      const parsed = parseFloat(bfpDraft)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        showToast('Body fat % must be between 0 and 100', 'error')
        return
      }
      bfp = parsed
    }
    logWeight.mutate(
      { recorded_at: today, weight, body_fat_percent: bfp },
      {
        onSuccess: () => {
          showToast('Weight logged')
          setDraft('')
          setBfpDraft('')
          setShowBfp(false)
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
            <p className="font-semibold text-foreground leading-none whitespace-nowrap">
              {latest ? (
                <>
                  <span className="text-2xl tabular-nums">
                    {roundMacro(latest.weight)}
                  </span>
                  <span className="text-xs font-normal text-subtle ml-1">
                    {weightUnit}
                  </span>
                </>
              ) : (
                <span className="text-subtle italic font-normal">
                  No entries
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {latest && (
                <p className="text-[11px] text-muted tabular-nums">
                  {loggedToday
                    ? 'Logged today'
                    : daysSince === 1
                      ? 'Yesterday'
                      : daysSince != null
                        ? `${daysSince}d ago`
                        : formatDate(latest.recorded_at)}
                </p>
              )}
              {/* BF% chip when the latest weigh-in has one — purple to
                  match the body-comp tone used elsewhere. */}
              {latest?.body_fat_percent != null && (
                <span className="text-[10px] font-semibold tabular-nums text-purple-fg bg-purple-soft border border-purple-line rounded-full px-1.5 py-0.5 whitespace-nowrap">
                  {roundMacro(latest.body_fat_percent)}% BF
                </span>
              )}
              {goalDiff != null && (
                <span
                  className={`text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5 border whitespace-nowrap ${
 Math.abs(goalDiff) < 0.5
 ? 'bg-emerald-soft text-emerald-fg border-emerald-line '
 : 'bg-indigo-soft text-indigo-fg border-indigo-line '
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
              className="space-y-2"
            >
              <div className="grid grid-cols-[1fr_auto] gap-2">
                {/* `text-base` keeps mobile keyboards from auto-zooming
                    the viewport (iOS triggers zoom when an input's
                    computed font-size is < 16px). `py-2.5` puts the
                    touch target around iOS's 44pt minimum. `min-w-0`
                    prevents the input from overflowing the half-width
                    column when the placeholder is long. */}
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder={`Weight (${weightUnit})`}
                  className="text-base py-2.5 min-w-0"
                />
                <Button
                  type="submit"
                  loading={saving}
                  disabled={!draft}
                >
                  {saving ? 'Saving…' : 'Log'}
                </Button>
              </div>
              {showBfp ? (
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="100"
                  value={bfpDraft}
                  onChange={e => setBfpDraft(e.target.value)}
                  placeholder="Body fat % (e.g. 18.5)"
                  className="text-base py-2.5 min-w-0"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBfp(true)}
                  className="text-[11px] font-medium text-purple-fg hover:text-purple-fg-strong cursor-pointer"
                >
                  + Add body fat %
                </button>
              )}
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
 : 'bg-transparent border border-line '
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
 d.isToday ? 'text-indigo-fg ' : 'text-subtle '
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
