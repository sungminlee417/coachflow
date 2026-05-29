'use client'

import { useState, useMemo } from 'react'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { Plus, Pencil, Trash2, Ruler, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatDate, roundMacro, formatLength } from '@/lib/utils'
import {
  useBodyMeasurements,
  useDeleteBodyMeasurement,
} from '@/lib/hooks/use-body-measurements'
import type { BodyMeasurement, LengthUnit } from '@/lib/types'
import MeasurementForm from './MeasurementForm'

interface MeasurementsTrackerProps {
  userId: string
  lengthUnit: LengthUnit
}

interface FieldDef {
  key: keyof BodyMeasurement
  label: string
  flexedKey?: keyof BodyMeasurement
}

const FIELDS: FieldDef[] = [
  { key: 'neck', label: 'Neck' },
  { key: 'shoulders', label: 'Shoulders', flexedKey: 'shoulders_flexed' },
  { key: 'chest', label: 'Chest / back', flexedKey: 'chest_flexed' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'arm_left', label: 'Left arm', flexedKey: 'arm_left_flexed' },
  { key: 'arm_right', label: 'Right arm', flexedKey: 'arm_right_flexed' },
  { key: 'thigh_left', label: 'Left thigh', flexedKey: 'thigh_left_flexed' },
  { key: 'thigh_right', label: 'Right thigh', flexedKey: 'thigh_right_flexed' },
  { key: 'calf_left', label: 'Left calf', flexedKey: 'calf_left_flexed' },
  { key: 'calf_right', label: 'Right calf', flexedKey: 'calf_right_flexed' },
]

// Body-measurement deltas are intentionally neutral — for arms/chest a
// gain is good, for waist/hips a loss is good, and for a recomp neither
// is universally "right". Colorizing red/green either way picks a side.
// The arrow + sign communicate direction; slate keeps the value-neutral.
function deltaIndicator(current: number, previous: number) {
  const diff = current - previous
  if (diff === 0) return { icon: Minus, text: '0', color: 'text-subtle' }
  if (diff > 0) {
    return {
      icon: TrendingUp,
      text: `+${roundMacro(diff)}`,
      color: 'text-muted',
    }
  }
  return {
    icon: TrendingDown,
    text: `${roundMacro(diff)}`,
    color: 'text-muted',
  }
}

const EMPTY_MEASUREMENTS: BodyMeasurement[] = []

export default function MeasurementsTracker({ userId, lengthUnit }: MeasurementsTrackerProps) {
  // Shared cache: this view, the form modal, and Today's
  // BodyMeasurementCard all read the same data and patch optimistically.
  const entriesQuery = useBodyMeasurements(userId)
  const entries = entriesQuery.data ?? EMPTY_MEASUREMENTS
  const loading = entriesQuery.isLoading && !entriesQuery.isSuccess
  const deleteMeasurement = useDeleteBodyMeasurement(userId)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BodyMeasurement | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = () => {
    if (!deletingId) return
    const id = deletingId
    setDeletingId(null)
    deleteMeasurement.mutate(id, {
      onSuccess: () => showToast('Measurement deleted'),
      onError: () => showToast('Failed to delete measurement', 'error'),
    })
  }

  // Pre-compute the history row metadata once per entry change. The previous
  // pass walked FIELDS twice per row (once for the summary string, once for
  // the filled count) — this collapses to a single walk and removes the
  // per-render work entirely. Declared above the loading early-return so
  // hook order stays stable across renders.
  const historyRows = useMemo(
    () =>
      entries.map(entry => {
        let filledCount = 0
        const previewParts: string[] = []
        // BF% gets first preference in the preview line because it's
        // the single most-watched body-comp number; circumference
        // entries follow until we hit the 3-chip cap.
        if (entry.body_fat_percent != null) {
          filledCount += 1
          previewParts.push(`BF ${roundMacro(entry.body_fat_percent)}%`)
        }
        for (const f of FIELDS) {
          const v = entry[f.key]
          if (v == null) continue
          filledCount += 1
          if (previewParts.length < 3) {
            previewParts.push(`${f.label} ${formatLength(v as number, lengthUnit)}`)
          }
        }
        return {
          entry,
          filledCount,
          summary: previewParts.join(' · '),
        }
      }),
    [entries, lengthUnit]
  )

  if (loading) {
    return (
      <div className="bg-surface rounded-2xl border border-line p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-elevated rounded-xl p-3 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const latest = entries[0]
  const previous = entries[1]

  return (
    <div className="bg-surface rounded-2xl border border-line p-5 sm:p-6">
      <MeasurementForm
        open={showForm}
        userId={userId}
        initial={editing}
        lengthUnit={lengthUnit}
        onClose={() => {
          setShowForm(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Delete measurement?"
        message="This entry will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      <div className="flex justify-between items-center gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-emerald-soft flex items-center justify-center shrink-0">
            <Ruler size={18} className="text-emerald-fg" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">Circumference</h3>
            <p className="text-xs text-muted truncate">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
        </div>
        <Button
          onClick={() => { setEditing(null); setShowForm(true) }}
          size="sm"
          className="shrink-0"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Log Entry</span>
          <span className="sm:hidden">Log</span>
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="No measurements yet"
          description="Log your first entry to start tracking your progress"
          action={
            <Button onClick={() => { setEditing(null); setShowForm(true) }}>
              <Plus size={16} />
              Log Your First Entry
            </Button>
          }
        />
      ) : (
        <>
          {/* Latest snapshot with deltas vs previous entry */}
          <div className="bg-elevated rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <p className="text-[10px] font-bold uppercase tracking-widest text-subtle">
                Latest &middot; {formatDate(latest.recorded_at)}
              </p>
              {previous && (
                <p className="text-[10px] text-subtle">
                  vs. {formatDate(previous.recorded_at)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {/* Body-fat % rendered first so it leads the eye when both
                  BF% and circumference numbers are present. Card uses
                  the same chrome as the FIELDS cells (label / value /
                  delta) but with a "%" suffix instead of a length unit. */}
              {latest.body_fat_percent != null && (() => {
                const value = latest.body_fat_percent
                const prevValue = previous?.body_fat_percent ?? null
                const delta =
                  prevValue != null ? deltaIndicator(value, prevValue) : null
                return (
                  <div
                    key="body_fat_percent"
                    className="bg-surface rounded-lg border border-line px-3 py-2.5 min-w-0"
                  >
                    <p className="text-[11px] text-muted truncate">Body fat</p>
                    <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-baseline">
                      <p className="text-lg sm:text-xl font-semibold text-foreground tabular-nums whitespace-nowrap min-w-0 truncate">
                        {roundMacro(value)}
                        <span className="text-[10px] sm:text-xs font-normal text-subtle ml-1">
                          %
                        </span>
                      </p>
                      {delta && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums shrink-0 ${delta.color}`}
                        >
                          <delta.icon size={11} />
                          {delta.text}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}
              {FIELDS.map(({ key, label, flexedKey }) => {
                const value = latest[key] as number | null
                if (value == null) return null
                const isFlexed = flexedKey ? (latest[flexedKey] as boolean) : false
                const prevValue = previous ? (previous[key] as number | null) : null
                const delta =
                  prevValue != null && value != null ? deltaIndicator(value, prevValue) : null
                return (
                  <div
                    key={key}
                    className="bg-surface rounded-lg border border-line px-3 py-2.5 min-w-0"
                  >
                    {/* Label row — truncates cleanly on narrow phones.
                        The (flexed/relaxed) tag is its own span so it doesn't
                        eat the label's available width when it's not there. */}
                    <p className="text-[11px] text-muted truncate">
                      {label}
                      {flexedKey && (
                        <span className="ml-1 text-[9px] text-subtle">
                          ({isFlexed ? 'flexed' : 'relaxed'})
                        </span>
                      )}
                    </p>
                    {/* Grid (not flex justify-between) so the right-side
                        delta keeps its own slot even when the value column
                        is forced narrow on small screens — value never gets
                        pushed onto a second line, delta never wraps. */}
                    <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-baseline">
                      <p className="text-lg sm:text-xl font-semibold text-foreground tabular-nums whitespace-nowrap min-w-0 truncate">
                        {formatLength(value, lengthUnit)}
                        <span className="text-[10px] sm:text-xs font-normal text-subtle ml-1">
                          {lengthUnit}
                        </span>
                      </p>
                      {delta && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums shrink-0 ${delta.color}`}
                        >
                          <delta.icon size={11} />
                          {delta.text}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {latest.notes && (
              <p className="text-sm text-muted italic mt-4 pt-4 border-t border-line-subtle">
                {latest.notes}
              </p>
            )}
          </div>

          {/* History list — uses `bg-white border` (not the snapshot's
              filled `bg-slate-50` block) so the hero "Latest" card and the
              list of past entries read as visually distinct tiers, not the
              same surface stacked twice. */}
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-subtle">
              History
            </p>
            <p className="text-[10px] tabular-nums text-subtle">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          <div className="space-y-1.5">
            {historyRows.map(({ entry, filledCount, summary }) => (
              <div
                key={entry.id}
                className="bg-surface border border-line hover:border-indigo-line transition-colors rounded-lg flex items-center gap-1 group"
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditing(entry)
                    setShowForm(true)
                  }}
                  className="flex-1 min-w-0 text-left px-3 py-3 cursor-pointer"
                  aria-label={`Edit measurement for ${formatDate(entry.recorded_at)}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground text-sm tabular-nums">
                      {formatDate(entry.recorded_at)}
                    </p>
                    <span className="text-[10px] font-semibold text-muted bg-elevated border border-line rounded-full px-2 py-px tabular-nums">
                      {filledCount} {filledCount === 1 ? 'measurement' : 'measurements'}
                    </span>
                    <Pencil
                      size={11}
                      className="text-faint sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                  {summary && (
                    <p className="text-xs text-muted mt-1 truncate">{summary}</p>
                  )}
                </button>
                <div className="pr-2 shrink-0">
                  <IconButton
                    tone="danger"
                    onClick={() => entry.id && setDeletingId(entry.id)}
                    aria-label="Delete measurement"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
