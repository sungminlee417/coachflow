'use client'

// Water intake for today. One row per (user, day) in `water_logs`; the
// trainee adds throughout the day via quick-add buttons and each tap
// upserts an atomic delta on the server (see `log_water_delta` RPC).
//
// Display unit follows the trainee's existing `weight_unit` (lbs → oz,
// kg → ml) so we don't add a separate hydration preference. Storage is
// always canonical millilitres.
//
// UX shape (tight so the card sits at half-width beside Weight without
// wrapping):
//   [ 32 / 64 oz  ▂▂▂▂▂▂▂▁▁▁ ]         [ ↶ Undo ]
//   [ +8 oz ] [ +16 oz ] [ +32 oz ]
// Goal met → progress bar flips emerald + a "Goal ✓" pill replaces the
// numeric fraction so the trainee gets a visible reward for hitting it.

import { useState } from 'react'
import { Droplets, Plus, Undo2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { showToast } from '@/components/ui/Toast'
import { useProfile } from '@/lib/hooks/use-profile'
import { useLogWaterDelta, useWaterLog } from '@/lib/hooks/use-water-logs'
import { todayISO } from '@/lib/utils'
import type { WeightUnit } from '@/lib/types'
import { Card, CardSkeletonBody, ProgressBar } from './primitives'

const ML_PER_OZ = 29.5735

// Presets are per-unit so button labels stay round in the trainee's
// natural unit. Values are what the RPC sees (in ml) — small differences
// vs. an exact conversion are irrelevant for hydration tracking.
const PRESETS_ML: Record<WeightUnit, Array<{ label: string; delta_ml: number }>> = {
  lbs: [
    { label: '+8 oz', delta_ml: 237 },
    { label: '+16 oz', delta_ml: 473 },
    { label: '+32 oz', delta_ml: 946 },
  ],
  kg: [
    { label: '+250 ml', delta_ml: 250 },
    { label: '+500 ml', delta_ml: 500 },
    { label: '+1 L', delta_ml: 1000 },
  ],
}

// Default when the user hasn't set a goal on their profile. Standard
// health guidance sits around 2 L / ~68 oz — round enough to feel like
// a real target without needing an onboarding step.
const DEFAULT_GOAL_ML = 2000

function displayAmount(ml: number, unit: WeightUnit): { value: number; suffix: string } {
  if (unit === 'lbs') {
    return { value: Math.round(ml / ML_PER_OZ), suffix: 'oz' }
  }
  return { value: ml, suffix: 'ml' }
}

export function WaterCard({
  userId,
  weightUnit,
  goalMl,
  onOpen,
}: {
  userId: string
  weightUnit: WeightUnit
  /** SSR-drilled initial goal from `profiles.water_daily_goal_ml`. The
   *  live value is read via `useProfile` below so a Settings save reflects
   *  on the card instantly without a page reload. This prop just seeds
   *  the first render when the cache is cold. */
  goalMl: number | null
  onOpen: () => void
}) {
  const today = todayISO()
  const waterQuery = useWaterLog(userId, today)
  const logDelta = useLogWaterDelta(userId)
  const profileQuery = useProfile(userId)
  const loaded = waterQuery.isSuccess

  // Track the last successful add so Undo knows exactly how much to
  // subtract — undoing "the whole day" (which the RPC could support via
  // a big negative delta) would be too destructive for a one-tap button.
  const [lastDelta, setLastDelta] = useState<number | null>(null)
  // Custom-amount field starts collapsed to keep the card compact for
  // the 90% path (preset buttons). Expands to a small numeric input when
  // the trainee needs an oddball amount (a 12 oz glass, a 700 ml flask).
  const [customOpen, setCustomOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState('')

  const amount = waterQuery.data?.amount_ml ?? 0
  // Prefer the live profile value so a Settings save reflects immediately;
  // fall back to the SSR-drilled prop while the profile query warms, and
  // finally to the app-wide default so the card never shows an empty goal.
  const liveGoal = profileQuery.data?.water_daily_goal_ml ?? goalMl
  const goal = liveGoal && liveGoal > 0 ? liveGoal : DEFAULT_GOAL_ML
  const consumed = displayAmount(amount, weightUnit)
  const target = displayAmount(goal, weightUnit)
  const goalMet = amount >= goal
  const presets = PRESETS_ML[weightUnit]

  const handleAdd = (delta_ml: number) => {
    logDelta.mutate(
      { date: today, delta_ml },
      {
        onSuccess: () => setLastDelta(delta_ml),
        onError: () => showToast('Failed to log water', 'error'),
      }
    )
  }

  const handleUndo = () => {
    if (lastDelta == null || lastDelta <= 0) return
    logDelta.mutate(
      { date: today, delta_ml: -lastDelta },
      {
        onSuccess: () => setLastDelta(null),
        onError: () => showToast('Failed to undo', 'error'),
      }
    )
  }

  const handleCustomAdd = () => {
    const n = parseFloat(customDraft)
    if (!Number.isFinite(n) || n <= 0) {
      showToast(`Enter an amount in ${weightUnit === 'lbs' ? 'oz' : 'ml'}`, 'error')
      return
    }
    // Round to ml at the boundary — the RPC only takes integers, and
    // fractional oz would show back rounded on the next render anyway.
    const delta_ml =
      weightUnit === 'lbs' ? Math.round(n * ML_PER_OZ) : Math.round(n)
    handleAdd(delta_ml)
    setCustomDraft('')
    setCustomOpen(false)
  }

  return (
    <Card onClick={onOpen} accent="indigo" icon={Droplets} label="Water">
      {!loaded ? (
        <CardSkeletonBody lines={2} />
      ) : (
        <div className="space-y-3">
          {/* Amount + progress row. `tabular-nums` keeps the fraction
              from jumping horizontally as the count rises. */}
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-foreground leading-none">
              <span className="text-2xl tabular-nums">{consumed.value}</span>
              <span className="text-xs font-normal text-subtle ml-1">
                / {target.value} {target.suffix}
              </span>
            </p>
            {goalMet && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-emerald-soft text-emerald-fg border border-emerald-line rounded-full px-2 py-0.5 whitespace-nowrap">
                Goal ✓
              </span>
            )}
          </div>

          {/* Progress bar switches to emerald once the goal is met so the
              trainee gets a visible reward without the layout shifting. */}
          <ProgressBar
            value={amount}
            total={goal}
            tone={goalMet ? 'emerald' : 'indigo'}
          />

          {/* Quick-add buttons + undo. Grid so the three add buttons
              share width evenly on any viewport and undo tucks at the
              end without stealing the row. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {presets.map(p => (
              <button
                key={p.delta_ml}
                type="button"
                onClick={() => handleAdd(p.delta_ml)}
                className="flex-1 min-w-17 inline-flex items-center justify-center px-2 py-1.5 rounded-lg border border-indigo-line bg-surface text-xs font-semibold text-indigo-fg hover:bg-indigo-soft hover:border-indigo-fg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 tabular-nums"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleUndo}
              disabled={lastDelta == null || lastDelta <= 0}
              aria-label="Undo last add"
              title="Undo last add"
              className="h-8 w-8 rounded-lg border border-line text-subtle hover:text-foreground hover:border-subtle flex items-center justify-center transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <Undo2 size={14} />
            </button>
          </div>

          {/* Custom-amount adder. Hidden behind a disclosure so the card
              stays compact for the common case (preset buttons) but still
              accommodates odd-sized containers (a 12 oz can, a 700 ml
              flask) without forcing multiple preset taps. */}
          {customOpen ? (
            <form
              onSubmit={e => {
                e.preventDefault()
                handleCustomAdd()
              }}
              className="grid grid-cols-[1fr_auto_auto] gap-1.5"
            >
              <div className="relative min-w-0">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={customDraft}
                  onChange={e => setCustomDraft(e.target.value)}
                  placeholder={`Amount in ${weightUnit === 'lbs' ? 'oz' : 'ml'}`}
                  className="text-sm py-1.5 pr-10"
                  autoFocus
                />
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-subtle pointer-events-none"
                  aria-hidden
                >
                  {weightUnit === 'lbs' ? 'oz' : 'ml'}
                </span>
              </div>
              <button
                type="submit"
                disabled={!customDraft}
                aria-label="Add custom amount"
                className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
              >
                <Plus size={12} />
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomOpen(false)
                  setCustomDraft('')
                }}
                aria-label="Cancel custom amount"
                className="h-8 px-2 rounded-lg text-xs font-medium text-subtle hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="text-[11px] font-medium text-indigo-fg hover:text-indigo-fg-strong cursor-pointer self-start rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              + Custom amount
            </button>
          )}
        </div>
      )}
    </Card>
  )
}
