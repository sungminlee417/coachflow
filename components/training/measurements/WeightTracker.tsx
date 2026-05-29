'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Trash2, TrendingUp, TrendingDown, Minus, Scale, Share2 } from 'lucide-react'
import { todayISO, formatDate, roundMacro, weekNumberSince } from '@/lib/utils'
import {
  useDeleteWeightLog,
  useLogWeight,
  useWeightLogs,
} from '@/lib/hooks/use-weight-logs'
import { WeightShareDialog } from './WeightShareDialog'
import type { WeightUnit } from '@/lib/types'

// Recharts is ~180KB gzipped — defer until this tab is actually visited so
// the initial app shell + Today dashboard stay lean. SSR off because the
// chart is purely client-side anyway.
const WeightChart = dynamic(
  () => import('./WeightChart').then(m => m.WeightChart),
  {
    ssr: false,
    loading: () => (
      <div className="bg-surface rounded-2xl border border-line p-4 sm:p-5 h-72 animate-pulse" />
    ),
  }
)

interface WeightTrackerProps {
  userId: string
  weightUnit: WeightUnit
  /** Initial value of the user's optional weight goal. The editor below
   *  the chart upserts changes back to `profiles.weight_goal`; we keep a
   *  local copy so the dashed reference line moves immediately on save. */
  weightGoal?: number | null
  /** Anchor date for "Week N" labels (e.g. start of the current cut /
   *  bulk). When set, the chart draws faint dashed lines at each weekly
   *  boundary and the share dialog tags each entry with its week.
   *  Persisted on `profiles.weight_program_start_date`. */
  programStart?: string | null
}

// Delta color is goal-aware. Without a goal we stay neutral — increase
// could be a bulk or a regression depending on what the user wants. With
// a goal, emerald = moving toward it, red = moving away.
function deltaIndicator(current: number, previous: number, goal?: number | null) {
  const diff = current - previous
  if (diff === 0) return { Icon: Minus, text: '0', color: 'text-subtle' }
  const increasing = diff > 0
  const Icon = increasing ? TrendingUp : TrendingDown
  const text = increasing ? `+${roundMacro(diff)}` : `${roundMacro(diff)}`
  let color = 'text-muted'
  if (goal != null && Number.isFinite(goal)) {
    const wantsDown = previous > goal
    const wantsUp = previous < goal
    const towardGoal =
      (wantsDown && !increasing) || (wantsUp && increasing)
    color = towardGoal ? 'text-emerald-600' : 'text-red-600'
  }
  return { Icon, text, color }
}

export default function WeightTracker({
  userId,
  weightUnit,
  weightGoal,
  programStart,
}: WeightTrackerProps) {
  // All weight reads/writes flow through the shared TanStack Query
  // cache, so this view and Today's WeightCard stay in sync without
  // re-fetches.
  const weightQuery = useWeightLogs(userId)
  const logs = weightQuery.data ?? []
  const logWeight = useLogWeight(userId)
  const deleteWeight = useDeleteWeightLog(userId)
  const supabase = useSupabase()
  const [newDate, setNewDate] = useState(todayISO())
  const [newWeight, setNewWeight] = useState('')
  // BF% lives on the same row as weight so a single submission can
  // capture both. Empty string = "don't update" (carries the prior
  // value forward on the upsert); a number is sent through.
  const [newBfp, setNewBfp] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showShare, setShowShare] = useState(false)
  // Local mirror so the dashed line moves immediately when the user
  // saves a new goal. Initial value comes from the parent (server).
  const [goal, setGoal] = useState<number | null>(weightGoal ?? null)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [savingGoal, setSavingGoal] = useState(false)
  // Same pattern for the program-start anchor.
  const [program, setProgram] = useState<string | null>(programStart ?? null)
  const [editingProgram, setEditingProgram] = useState(false)
  const [programDraft, setProgramDraft] = useState('')
  const [savingProgram, setSavingProgram] = useState(false)
  const saving = logWeight.isPending

  const handleLog = () => {
    const weight = parseFloat(newWeight)
    if (!newWeight || Number.isNaN(weight) || weight <= 0) {
      showToast('Enter a valid weight', 'error')
      return
    }
    // BF% is optional. Anything outside the 0–100 band is rejected at
    // the input layer so the upsert never sees garbage; an empty field
    // is sent as `undefined` so an existing reading isn't clobbered.
    let bfp: number | null | undefined = undefined
    if (newBfp !== '') {
      const parsed = parseFloat(newBfp)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        showToast('Body fat % must be between 0 and 100', 'error')
        return
      }
      bfp = parsed
    }
    logWeight.mutate(
      { recorded_at: newDate, weight, body_fat_percent: bfp },
      {
        onSuccess: () => {
          setNewWeight('')
          setNewBfp('')
          setNewDate(todayISO())
          showToast('Weight logged')
        },
        onError: () => showToast('Failed to log weight', 'error'),
      }
    )
  }

  const handleDelete = () => {
    if (!deletingId) return
    const id = deletingId
    setDeletingId(null)
    deleteWeight.mutate(id, {
      onSuccess: () => showToast('Weight entry deleted'),
      onError: () => showToast('Failed to delete entry', 'error'),
    })
  }

  const latest = logs[0]
  const previous = logs[1]
  const delta = latest && previous ? deltaIndicator(latest.weight, previous.weight, goal) : null

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
        programStart={program}
        onClose={() => setShowShare(false)}
      />

      <div className="bg-surface rounded-2xl border border-line p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-indigo-soft flex items-center justify-center shrink-0">
              <Scale size={18} className="text-indigo-fg" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">Weight</h3>
              <p className="text-xs text-muted truncate">
                Log daily &middot; {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          </div>
          {latest && (
            <div className="text-right ml-auto">
              <div className="flex items-baseline gap-2 justify-end flex-wrap">
                <span className="text-3xl font-bold text-foreground tabular-nums">
                  {roundMacro(latest.weight)}
                </span>
                <span className="text-sm font-medium text-subtle">{weightUnit}</span>
                {delta && (
                  <span className={`flex items-center gap-0.5 text-sm font-medium ${delta.color}`}>
                    <delta.Icon size={14} />
                    {delta.text}
                  </span>
                )}
              </div>
              <p className="text-xs text-subtle mt-0.5">{formatDate(latest.recorded_at)}</p>
            </div>
          )}
        </div>

        {logs.length >= 2 && (
          <div className="mb-5">
            <WeightChart
              logs={logs}
              weightUnit={weightUnit}
              goal={goal}
              programStart={program}
            />
          </div>
        )}

        {/* Goal editor — collapsed by default. Tap the "Set goal" text
            to expand. Saving writes to `profiles.weight_goal` and the
            dashed reference line on the chart updates immediately. */}
        <div className="mb-5 flex items-center gap-2 text-xs flex-wrap">
          {!editingGoal ? (
            <>
              {goal != null ? (
                <p className="text-muted">
                  Goal:{' '}
                  <span className="font-semibold text-foreground tabular-nums">
                    {roundMacro(goal)} {weightUnit}
                  </span>
                </p>
              ) : (
                <p className="text-subtle italic">No goal set</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setGoalDraft(goal != null ? String(goal) : '')
                  setEditingGoal(true)
                }}
                className="text-indigo-fg hover:text-indigo-fg-strong font-medium cursor-pointer"
              >
                {goal != null ? 'Edit' : 'Set goal'}
              </button>
              {goal != null && (
                <button
                  type="button"
                  onClick={async () => {
                    setSavingGoal(true)
                    const { error } = await supabase
                      .from('profiles')
                      .update({ weight_goal: null })
                      .eq('id', userId)
                    setSavingGoal(false)
                    if (error) {
                      showToast('Failed to clear goal', 'error')
                    } else {
                      setGoal(null)
                      showToast('Goal cleared')
                    }
                  }}
                  disabled={savingGoal}
                  className="text-subtle hover:text-red-fg font-medium cursor-pointer disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </>
          ) : (
            <form
              onSubmit={async e => {
                e.preventDefault()
                const next = goalDraft === '' ? null : parseFloat(goalDraft)
                if (next != null && (!Number.isFinite(next) || next <= 0)) {
                  showToast('Enter a positive number', 'error')
                  return
                }
                setSavingGoal(true)
                const { error } = await supabase
                  .from('profiles')
                  .update({ weight_goal: next })
                  .eq('id', userId)
                setSavingGoal(false)
                if (error) {
                  showToast('Failed to save goal', 'error')
                  return
                }
                setGoal(next)
                setEditingGoal(false)
                showToast(next != null ? 'Goal saved' : 'Goal cleared')
              }}
              className="flex items-center gap-2 flex-wrap"
            >
              <label className="text-muted">
                Goal weight ({weightUnit})
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={goalDraft}
                onChange={e => setGoalDraft(e.target.value)}
                placeholder="e.g. 180"
                className="text-sm py-1 w-24"
                autoFocus
              />
              <Button type="submit" size="sm" loading={savingGoal}>
                Save
              </Button>
              <button
                type="button"
                onClick={() => setEditingGoal(false)}
                className="text-subtle hover:text-foreground font-medium cursor-pointer"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Program-start editor — same collapsed/expanded pattern as the
            goal editor. When set, the chart marks weekly boundaries and
            the share dialog tags each entry with a Week N. */}
        <div className="mb-5 flex items-center gap-2 text-xs flex-wrap">
          {!editingProgram ? (
            <>
              {program != null ? (
                <p className="text-muted">
                  Program start:{' '}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatDate(program)}
                  </span>
                  {(() => {
                    const today = todayISO()
                    const wk = weekNumberSince(program, today)
                    return wk != null ? (
                      <span className="text-subtle ml-1.5">
                        (Week {wk})
                      </span>
                    ) : null
                  })()}
                </p>
              ) : (
                <p className="text-subtle italic">No program start set</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setProgramDraft(program ?? todayISO())
                  setEditingProgram(true)
                }}
                className="text-indigo-fg hover:text-indigo-fg-strong font-medium cursor-pointer"
              >
                {program != null ? 'Edit' : 'Set start'}
              </button>
              {program != null && (
                <button
                  type="button"
                  onClick={async () => {
                    setSavingProgram(true)
                    const { error } = await supabase
                      .from('profiles')
                      .update({ weight_program_start_date: null })
                      .eq('id', userId)
                    setSavingProgram(false)
                    if (error) {
                      showToast('Failed to clear program start', 'error')
                    } else {
                      setProgram(null)
                      showToast('Program start cleared')
                    }
                  }}
                  disabled={savingProgram}
                  className="text-subtle hover:text-red-fg font-medium cursor-pointer disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </>
          ) : (
            <form
              onSubmit={async e => {
                e.preventDefault()
                if (!programDraft) {
                  showToast('Pick a date', 'error')
                  return
                }
                if (programDraft > todayISO()) {
                  showToast(
                    "Start date can't be in the future",
                    'error'
                  )
                  return
                }
                setSavingProgram(true)
                const { error } = await supabase
                  .from('profiles')
                  .update({ weight_program_start_date: programDraft })
                  .eq('id', userId)
                setSavingProgram(false)
                if (error) {
                  showToast('Failed to save program start', 'error')
                  return
                }
                setProgram(programDraft)
                setEditingProgram(false)
                showToast('Program start saved')
              }}
              className="flex items-center gap-2 flex-wrap"
            >
              <label className="text-muted">Program start</label>
              <div className="w-44">
                <DatePicker value={programDraft} onChange={setProgramDraft} />
              </div>
              <Button type="submit" size="sm" loading={savingProgram}>
                Save
              </Button>
              <button
                type="button"
                onClick={() => setEditingProgram(false)}
                className="text-subtle hover:text-foreground font-medium cursor-pointer"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Quick log form. Three equal columns on tablet+: date, weight,
            BF%; submit button sits in its own auto-width column on the
            right. On mobile each input stacks full-width. */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor="wt-date" className="block text-[10px] text-muted mb-1 uppercase tracking-wide">
              Date
            </label>
            <DatePicker id="wt-date" value={newDate} onChange={setNewDate} />
          </div>
          <div>
            <label htmlFor="wt-weight" className="block text-[10px] text-muted mb-1 uppercase tracking-wide">
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
          <div>
            <label
              htmlFor="wt-bfp"
              className="block text-[10px] text-muted mb-1 uppercase tracking-wide"
            >
              Body fat % <span className="text-faint normal-case">· optional</span>
            </label>
            <Input
              id="wt-bfp"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="100"
              value={newBfp}
              onChange={e => setNewBfp(e.target.value)}
              placeholder="e.g. 18.5"
              className="text-sm"
            />
          </div>
          <Button onClick={handleLog} loading={saving}>
            {saving ? 'Logging…' : 'Log'}
          </Button>
        </div>

        {/* Recent history */}
        {logs.length > 0 && (
          <div className="mt-5 pt-4 border-t border-line-subtle">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-subtle">
                Recent
              </p>
              <button
                type="button"
                onClick={() => setShowShare(true)}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-fg hover:text-indigo-fg hover:bg-indigo-soft px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
              >
                <Share2 size={14} />
                Share
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {logs.slice(0, 10).map((log, i) => {
                const prev = logs[i + 1]
                const d = prev ? deltaIndicator(log.weight, prev.weight, goal) : null
                const wk = weekNumberSince(program, log.recorded_at)
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-elevated group"
                  >
                    {wk != null && (
                      <span className="text-[10px] font-semibold tabular-nums text-indigo-fg bg-indigo-soft rounded-full px-1.5 py-0.5 shrink-0">
                        W{wk}
                      </span>
                    )}
                    <span className="text-xs text-muted shrink-0 min-w-0 truncate">
                      {formatDate(log.recorded_at)}
                    </span>
                    <span className="text-sm font-medium text-foreground tabular-nums ml-auto">
                      {roundMacro(log.weight)}{' '}
                      <span className="text-xs text-subtle font-normal">{weightUnit}</span>
                    </span>
                    {log.body_fat_percent != null && (
                      <span className="text-[10px] font-semibold tabular-nums text-purple-fg bg-purple-soft rounded-full px-1.5 py-0.5 shrink-0">
                        {roundMacro(log.body_fat_percent)}% BF
                      </span>
                    )}
                    {d && (
                      <span className={`flex items-center gap-0.5 text-xs shrink-0 ${d.color}`}>
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
