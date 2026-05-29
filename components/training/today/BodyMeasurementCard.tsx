'use client'

import { Ruler } from 'lucide-react'
import { useBodyMeasurements } from '@/lib/hooks/use-body-measurements'
import { daysBetween, formatDate, roundMacro, todayISO } from '@/lib/utils'
import { Card, CardSkeletonBody } from './primitives'

// Compact "when did I last measure" card — measurements are weekly-ish,
// not daily, so this stays a single-row tile. Tap to jump to the full
// Body view for logging a new entry.
export function BodyMeasurementCard({
  userId,
  onOpen,
}: {
  userId: string
  onOpen: () => void
}) {
  // Same query the deep tracker uses, so the cache is shared. We only
  // need the most-recent entry to drive this card's copy.
  const measurementsQuery = useBodyMeasurements(userId)
  const latest = measurementsQuery.data?.[0] ?? null
  // Hold the skeleton over a stale-empty cache until a fresh fetch
  // confirms emptiness — `isStale` covers the brief gap before
  // `isFetching` flips.
  const loaded =
    measurementsQuery.isSuccess &&
    !(
      (measurementsQuery.data?.length ?? 0) === 0 &&
      (measurementsQuery.isFetching || measurementsQuery.isStale)
    )

  const today = todayISO()
  const daysSince = latest ? Math.max(0, daysBetween(latest.recorded_at, today)) : null

  return (
    <Card onClick={onOpen} accent="purple" icon={Ruler} label="Measurements">
      {!loaded ? (
        <CardSkeletonBody lines={1} />
      ) : !latest ? (
        <p className="text-sm text-muted">
          No measurements yet. Tap to record neck / waist / arms / legs.
        </p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">
              {/* If the latest entry includes a BF% reading, lead with
                  it — it's the single most-watched body-comp number, so
                  putting it ahead of the generic "Last measured" copy
                  saves the trainee a tap to confirm the value. */}
              {latest.body_fat_percent != null
                ? `Body fat ${roundMacro(latest.body_fat_percent)}%`
                : 'Last measured'}
            </p>
          </div>
          <p className="text-xs text-muted shrink-0">
            {daysSince === 0
              ? 'Today'
              : daysSince === 1
                ? 'Yesterday'
                : daysSince != null
                  ? `${daysSince} days ago`
                  : formatDate(latest.recorded_at)}
          </p>
        </div>
      )}
    </Card>
  )
}
