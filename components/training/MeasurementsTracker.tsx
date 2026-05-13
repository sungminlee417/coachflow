'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { Plus, Pencil, Trash2, Ruler, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatDate, roundMacro, formatLength } from '@/lib/utils'
import { cachedQuery } from '@/lib/cached-query'
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

function deltaIndicator(current: number, previous: number) {
  const diff = current - previous
  if (diff === 0) return { icon: Minus, text: '0', color: 'text-slate-400' }
  if (diff > 0) {
    return {
      icon: TrendingUp,
      text: `+${roundMacro(diff)}`,
      color: 'text-emerald-600',
    }
  }
  return {
    icon: TrendingDown,
    text: `${roundMacro(diff)}`,
    color: 'text-red-600',
  }
}

export default function MeasurementsTracker({ userId, lengthUnit }: MeasurementsTrackerProps) {
  const supabase = useSupabase()
  const [entries, setEntries] = useState<BodyMeasurement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BodyMeasurement | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchEntries = async () => {
    setLoading(true)
    const { data } = await cachedQuery<BodyMeasurement[]>(
      `body_measurements:${userId}`,
      () =>
        supabase
          .from('body_measurements')
          .select('*')
          .eq('user_id', userId)
          .order('recorded_at', { ascending: false })
          .order('created_at', { ascending: false })
    )
    setEntries(data ?? [])
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const { error } = await supabase
        .from('body_measurements')
        .delete()
        .eq('id', deletingId)
      if (error) throw error
      await fetchEntries()
      showToast('Measurement deleted')
    } catch {
      showToast('Failed to delete measurement', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2">
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <MeasurementForm
        open={showForm}
        userId={userId}
        initial={editing}
        lengthUnit={lengthUnit}
        onClose={() => {
          setShowForm(false)
          setEditing(null)
          fetchEntries()
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
          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Ruler size={18} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">Circumference</h3>
            <p className="text-xs text-slate-500 truncate">
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
          <div className="bg-slate-50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Latest &middot; {formatDate(latest.recorded_at)}
              </p>
              {previous && (
                <p className="text-[10px] text-slate-400">
                  vs. {formatDate(previous.recorded_at)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
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
                    className="bg-white rounded-lg border border-slate-200 px-3 py-2 min-w-0"
                  >
                    <p className="text-[11px] text-slate-500 truncate">
                      {label}
                      {flexedKey && (
                        <span className="ml-1 text-[9px] text-slate-400">
                          ({isFlexed ? 'flexed' : 'relaxed'})
                        </span>
                      )}
                    </p>
                    <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
                      <p className="text-lg sm:text-xl font-semibold text-slate-900 tabular-nums">
                        {formatLength(value, lengthUnit)}
                        <span className="text-[10px] sm:text-xs font-normal text-slate-400 ml-1">
                          {lengthUnit}
                        </span>
                      </p>
                      {delta && (
                        <span
                          className={`flex items-center gap-0.5 text-[11px] font-medium ${delta.color}`}
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
              <p className="text-sm text-slate-600 italic mt-4 pt-4 border-t border-slate-100">
                {latest.notes}
              </p>
            )}
          </div>

          {/* History list */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            History
          </p>
          <div className="space-y-1.5">
            {entries.map(entry => {
              const summary = FIELDS.filter(f => entry[f.key] != null)
                .slice(0, 3)
                .map(f => `${f.label} ${formatLength(entry[f.key] as number, lengthUnit)}`)
                .join(' · ')
              const filledCount = FIELDS.filter(f => entry[f.key] != null).length
              return (
                <div
                  key={entry.id}
                  className="bg-slate-50 hover:bg-slate-100 transition-colors rounded-lg flex items-center gap-1 group"
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
                      <p className="font-medium text-slate-900 text-sm">
                        {formatDate(entry.recorded_at)}
                      </p>
                      <span className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-px tabular-nums">
                        {filledCount} {filledCount === 1 ? 'measurement' : 'measurements'}
                      </span>
                      <Pencil
                        size={11}
                        className="text-slate-300 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                    {summary && (
                      <p className="text-xs text-slate-500 mt-1 truncate">{summary}</p>
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
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
