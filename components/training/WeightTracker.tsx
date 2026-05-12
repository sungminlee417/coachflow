'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Trash2, TrendingUp, TrendingDown, Minus, Scale, Share2 } from 'lucide-react'
import { todayISO, formatDate, roundMacro } from '@/lib/utils'
import type { WeightLog } from '@/lib/types'
import { WeightChart } from './WeightChart'
import { WeightShareDialog } from './WeightShareDialog'
import type { WeightUnit } from '@/lib/types'

interface WeightTrackerProps {
  userId: string
  weightUnit: WeightUnit
}

function deltaIndicator(current: number, previous: number) {
  const diff = current - previous
  if (diff === 0) return { Icon: Minus, text: '0', color: 'text-slate-400' }
  if (diff > 0) {
    return { Icon: TrendingUp, text: `+${roundMacro(diff)}`, color: 'text-emerald-600' }
  }
  return { Icon: TrendingDown, text: `${roundMacro(diff)}`, color: 'text-red-600' }
}

export default function WeightTracker({ userId, weightUnit }: WeightTrackerProps) {
  const supabase = useSupabase()
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState(todayISO())
  const [newWeight, setNewWeight] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(30)

      if (error) throw error
      setLogs(data || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleLog = async () => {
    const weight = parseFloat(newWeight)
    if (!newWeight || Number.isNaN(weight) || weight <= 0) {
      showToast('Enter a valid weight', 'error')
      return
    }

    setSaving(true)
    try {
      // Upsert: if there's already an entry for this date, overwrite it.
      const { error } = await supabase
        .from('weight_logs')
        .upsert(
          { user_id: userId, recorded_at: newDate, weight },
          { onConflict: 'user_id,recorded_at' }
        )
      if (error) throw error
      setNewWeight('')
      setNewDate(todayISO())
      await fetchLogs()
      showToast('Weight logged')
    } catch {
      showToast('Failed to log weight', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const { error } = await supabase.from('weight_logs').delete().eq('id', deletingId)
      if (error) throw error
      await fetchLogs()
      showToast('Weight entry deleted')
    } catch {
      showToast('Failed to delete entry', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const latest = logs[0]
  const previous = logs[1]
  const delta = latest && previous ? deltaIndicator(latest.weight, previous.weight) : null

  return (
    <div>
      <ConfirmDialog
        open={!!deletingId}
        title="Delete weight entry?"
        message="This entry will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      <WeightShareDialog
        open={showShare}
        userId={userId}
        weightUnit={weightUnit}
        onClose={() => setShowShare(false)}
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Scale size={18} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900">Weight</h3>
              <p className="text-xs text-slate-500 truncate">
                Log daily &middot; {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          </div>
          {latest && (
            <div className="text-right ml-auto">
              <div className="flex items-baseline gap-2 justify-end flex-wrap">
                <span className="text-3xl font-bold text-slate-900 tabular-nums">
                  {roundMacro(latest.weight)}
                </span>
                <span className="text-sm font-medium text-slate-400">{weightUnit}</span>
                {delta && (
                  <span className={`flex items-center gap-0.5 text-sm font-medium ${delta.color}`}>
                    <delta.Icon size={14} />
                    {delta.text}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{formatDate(latest.recorded_at)}</p>
            </div>
          )}
        </div>

        {logs.length >= 2 && (
          <div className="mb-5">
            <WeightChart logs={logs} weightUnit={weightUnit} />
          </div>
        )}

        {/* Quick log form */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor="wt-date" className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wide">
              Date
            </label>
            <DatePicker id="wt-date" value={newDate} onChange={setNewDate} />
          </div>
          <div>
            <label htmlFor="wt-weight" className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wide">
              Weight ({weightUnit})
            </label>
            <Input
              id="wt-weight"
              type="number"
              step="any"
              min="0"
              value={newWeight}
              onChange={e => setNewWeight(e.target.value)}
              placeholder={`0 ${weightUnit}`}
              className="text-sm"
            />
          </div>
          <Button onClick={handleLog} loading={saving}>
            {saving ? 'Logging…' : 'Log'}
          </Button>
        </div>

        {/* Recent history */}
        {!loading && logs.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Recent
              </p>
              <button
                type="button"
                onClick={() => setShowShare(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
              >
                <Share2 size={14} />
                Share
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {logs.slice(0, 10).map((log, i) => {
                const prev = logs[i + 1]
                const d = prev ? deltaIndicator(log.weight, prev.weight) : null
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 group"
                  >
                    <span className="text-xs text-slate-500 flex-shrink-0 min-w-0 truncate">
                      {formatDate(log.recorded_at)}
                    </span>
                    <span className="text-sm font-medium text-slate-900 tabular-nums ml-auto">
                      {roundMacro(log.weight)}{' '}
                      <span className="text-xs text-slate-400 font-normal">{weightUnit}</span>
                    </span>
                    {d && (
                      <span className={`flex items-center gap-0.5 text-xs flex-shrink-0 ${d.color}`}>
                        <d.Icon size={11} />
                        {d.text}
                      </span>
                    )}
                    <IconButton
                      tone="danger"
                      onClick={() => log.id && setDeletingId(log.id)}
                      aria-label="Delete entry"
                      className="opacity-50 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
