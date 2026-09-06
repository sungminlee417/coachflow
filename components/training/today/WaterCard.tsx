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
import { Droplets, Undo2 } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
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
  /** Trainee-configured daily goal in ml. NULL falls back to DEFAULT_GOAL_ML. */
  goalMl: number | null
  onOpen: () => void
}) {
  const today = todayISO()
  const waterQuery = useWaterLog(userId, today)
  const logDelta = useLogWaterDelta(userId)
  const loaded = waterQuery.isSuccess

  // Track the last successful add so Undo knows exactly how much to
  // subtract — undoing "the whole day" (which the RPC could support via
  // a big negative delta) would be too destructive for a one-tap button.
  const [lastDelta, setLastDelta] = useState<number | null>(null)

  const amount = waterQuery.data?.amount_ml ?? 0
  const goal = goalMl && goalMl > 0 ? goalMl : DEFAULT_GOAL_ML
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
                className="flex-1 min-w-[68px] inline-flex items-center justify-center px-2 py-1.5 rounded-lg border border-indigo-line bg-surface text-xs font-semibold text-indigo-fg hover:bg-indigo-soft hover:border-indigo-fg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 tabular-nums"
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
        </div>
      )}
    </Card>
  )
}
