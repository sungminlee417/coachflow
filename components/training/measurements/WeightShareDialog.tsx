'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DatePicker } from '@/components/ui/DatePicker'
import { Share2, Copy, Download } from 'lucide-react'
import {
  daysBetween,
  formatDate,
  roundMacro,
  shiftDateISO,
  todayISO,
  weekNumberSince,
} from '@/lib/utils'
import type { WeightLog, WeightUnit } from '@/lib/types'

interface WeightShareDialogProps {
  open: boolean
  userId: string
  weightUnit: WeightUnit
  /** Optional program anchor for "Week N" labels. When set, each row in
   *  the share text gets prefixed with its program week and the CSV
   *  carries a `week` column. */
  programStart?: string | null
  onClose: () => void
}

export function WeightShareDialog({
  open,
  userId,
  weightUnit,
  programStart,
  onClose,
}: WeightShareDialogProps) {
  const supabase = useSupabase()
  // Default window: trailing 30 days, ending today. Coaches usually ask
  // "send me your weights since last month" — this is the closest match.
  const [from, setFrom] = useState(() => shiftDateISO(todayISO(), -30))
  const [to, setTo] = useState(() => todayISO())
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(false)

  // Reset the window every time the modal opens — coach asks again, the
  // user expects "last 30 days from now", not whatever they had picked
  // before.
  useEffect(() => {
    if (!open) return
    setFrom(shiftDateISO(todayISO(), -30))
    setTo(todayISO())
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const fetchRange = async () => {
      setLoading(true)
      // Normalize ordering so the query is valid even if the user picks
      // From after To by mistake — we still return the chronological set.
      const [lo, hi] = from <= to ? [from, to] : [to, from]
      try {
        const { data, error } = await supabase
          .from('weight_logs')
          .select('*')
          .eq('user_id', userId)
          .gte('recorded_at', lo)
          .lte('recorded_at', hi)
          .order('recorded_at', { ascending: true })
        if (error) throw error
        if (!cancelled) setLogs(data || [])
      } catch {
        if (!cancelled) setLogs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchRange()
    return () => {
      cancelled = true
    }
  }, [open, userId, from, to, supabase])

  // Summary stats — what a coach actually wants out of "send me your
  // weights." Computed off the chronologically-sorted query result so
  // first/last reflect actual range endpoints, not the date pickers.
  const summary = useMemo(() => {
    if (logs.length === 0) return null
    const first = logs[0]
    const last = logs[logs.length - 1]
    const delta = last.weight - first.weight
    const span = Math.max(1, daysBetween(first.recorded_at, last.recorded_at))
    const perWeek = (delta / span) * 7
    return {
      first: first.weight,
      last: last.weight,
      delta,
      perWeek,
    }
  }, [logs])

  const shareText = useMemo(() => {
    if (logs.length === 0) return ''
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    const header = `Weight log · ${formatDate(lo)} – ${formatDate(hi)} (${weightUnit})`
    const summaryLine = summary
      ? `Start ${roundMacro(summary.first)} → End ${roundMacro(summary.last)} · ` +
        `Δ ${summary.delta >= 0 ? '+' : ''}${roundMacro(summary.delta)} ${weightUnit} · ` +
        `${summary.perWeek >= 0 ? '+' : ''}${roundMacro(summary.perWeek)} ${weightUnit}/wk`
      : null
    const lines = logs.map(l => {
      const wk = weekNumberSince(programStart ?? null, l.recorded_at)
      const wkTag = wk != null ? `W${wk} · ` : ''
      return `${wkTag}${formatDate(l.recorded_at)} — ${roundMacro(l.weight)}`
    })
    return [header, ...(summaryLine ? [summaryLine, ''] : []), ...lines].join('\n')
  }, [logs, from, to, weightUnit, summary, programStart])

  const csvText = useMemo(() => {
    if (logs.length === 0) return ''
    const hasWeek = !!programStart
    const head = hasWeek
      ? `date,weight_${weightUnit},week`
      : `date,weight_${weightUnit}`
    const rows = logs.map(l => {
      const wk = weekNumberSince(programStart ?? null, l.recorded_at)
      const base = `${l.recorded_at},${roundMacro(l.weight)}`
      return hasWeek ? `${base},${wk ?? ''}` : base
    })
    return [head, ...rows].join('\n')
  }, [logs, weightUnit, programStart])

  const handleDownloadCsv = () => {
    if (!csvText) return
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `weight-log-${lo}-to-${hi}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Defer revoke so Safari's download trigger has time to read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handleShare = async () => {
    if (!shareText) return
    const canShare =
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    if (canShare) {
      try {
        await navigator.share({ text: shareText, title: 'Weight log' })
      } catch (err) {
        // User dismissed the share sheet — that's not an error worth toasting.
        if ((err as { name?: string })?.name !== 'AbortError') {
          showToast('Failed to share', 'error')
        }
      }
      return
    }
    // Desktop browsers without Web Share API: fall back to clipboard.
    try {
      await navigator.clipboard.writeText(shareText)
      showToast('Copied to clipboard')
    } catch {
      showToast('Failed to share', 'error')
    }
  }

  const handleCopy = async () => {
    if (!shareText) return
    try {
      await navigator.clipboard.writeText(shareText)
      showToast('Copied to clipboard')
    } catch {
      showToast('Failed to copy', 'error')
    }
  }

  const setQuickRange = (days: number) => {
    setTo(todayISO())
    setFrom(shiftDateISO(todayISO(), -days))
  }

  return (
    <Modal open={open} title="Share weight log" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="ws-from"
              className="block text-[10px] text-muted mb-1 uppercase tracking-wide"
            >
              From
            </label>
            <DatePicker id="ws-from" value={from} onChange={setFrom} />
          </div>
          <div>
            <label
              htmlFor="ws-to"
              className="block text-[10px] text-muted mb-1 uppercase tracking-wide"
            >
              To
            </label>
            <DatePicker id="ws-to" value={to} onChange={setTo} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { label: '7 days', days: 7 },
            { label: '30 days', days: 30 },
            { label: '90 days', days: 90 },
          ].map(opt => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setQuickRange(opt.days)}
              className="px-3 py-2 text-xs font-medium rounded-full border border-line text-muted hover:border-indigo-300 hover:text-indigo-fg hover:bg-indigo-wash transition-colors cursor-pointer"
            >
              Last {opt.label}
            </button>
          ))}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-subtle mb-2">
            Preview
          </p>
          <div className="bg-elevated border border-line rounded-lg p-3 max-h-64 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-subtle">Loading…</p>
            ) : shareText ? (
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {shareText}
              </pre>
            ) : (
              <p className="text-sm text-subtle">
                No weight entries in this range.
              </p>
            )}
          </div>
          {shareText && (
            <p className="text-[11px] text-subtle mt-2">
              {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
            </p>
          )}
        </div>
      </div>

      {/* On phones the actions stack to full-width tap targets; on sm+
          they sit inline on the right where the modal is centered. CSV
          stays as a secondary download button — useful for trainees who
          want to drop the data into a spreadsheet rather than a chat. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-4 mt-2 border-t border-line-subtle">
        <div className="hidden sm:block sm:flex-1" />
        <Button
          variant="secondary"
          onClick={handleDownloadCsv}
          disabled={!csvText}
          className="w-full sm:w-auto"
        >
          <Download size={14} />
          CSV
        </Button>
        <Button
          variant="secondary"
          onClick={handleCopy}
          disabled={!shareText}
          className="w-full sm:w-auto"
        >
          <Copy size={14} />
          Copy
        </Button>
        <Button
          onClick={handleShare}
          disabled={!shareText}
          className="w-full sm:w-auto"
        >
          <Share2 size={14} />
          Share
        </Button>
      </div>
    </Modal>
  )
}
