'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { AssigneePicker } from '@/components/ui/AssigneePicker'
import { Calendar, ListChecks, Users } from 'lucide-react'
import { todayISO } from '@/lib/utils'

interface ProgramAssignmentModalProps {
  open: boolean
  coachId: string
  programId: string
  programName: string
  preselectedClientId?: string
  onClose: () => void
}

interface MemberRow {
  workout_id: string
  workout: {
    id: string
    name: string
    cycle_length: number | null
    cycle_position: number | null
  } | null
}

interface RosterEntry {
  id: string
  label: string
  hint: string
  isSelf: boolean
}

export default function ProgramAssignmentModal({
  open,
  coachId,
  programId,
  programName,
  preselectedClientId,
  onClose,
}: ProgramAssignmentModalProps) {
  const supabase = useSupabase()
  const [clientId, setClientId] = useState(preselectedClientId ?? '')
  const [showSchedule, setShowSchedule] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cycleAnchor, setCycleAnchor] = useState('')
  const [notes, setNotes] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [assigning, setAssigning] = useState(false)
  // Bulk mode swaps the single-select dropdown for a checklist of every
  // client the coach has, plus a "Myself" row. Defaults to off so the
  // common case of "assign to one trainee" stays a one-tap flow.
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)
  // Bulk roster only loads when the toggle flips on, so we don't pay for
  // the relationship+profile fetch in the single-assign path.
  useEffect(() => {
    if (!bulkMode || roster.length > 0) return
    let cancelled = false
    setLoadingRoster(true)
    ;(async () => {
      try {
        const [{ data: rels }, { data: profile }] = await Promise.all([
          supabase
            .from('coach_client_relationships')
            .select('client:client_id ( id, full_name, email )')
            .eq('coach_id', coachId)
            .eq('status', 'active')
            .neq('client_id', coachId),
          supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', coachId)
            .single(),
        ])
        if (cancelled) return
        type RelRow = {
          client: { id: string; full_name: string | null; email: string | null } | null
        }
        const rosterList: RosterEntry[] = []
        if (profile) {
          rosterList.push({
            id: profile.id,
            label: `Myself (${profile.full_name ?? 'You'})`,
            hint: profile.email ?? '',
            isSelf: true,
          })
        }
        for (const r of (rels ?? []) as unknown as RelRow[]) {
          if (!r.client) continue
          rosterList.push({
            id: r.client.id,
            label: r.client.full_name ?? r.client.email ?? 'Client',
            hint: r.client.email ?? '',
            isSelf: false,
          })
        }
        setRoster(rosterList)
      } finally {
        if (!cancelled) setLoadingRoster(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bulkMode, coachId, roster.length, supabase])

  useEffect(() => {
    if (!open || !programId) return
    let cancelled = false
    setLoadingMembers(true)
    ;(async () => {
      const { data } = await supabase
        .from('workout_program_workouts')
        .select(
          'workout_id, order_index, workout:workout_id ( id, name, cycle_length, cycle_position )'
        )
        .eq('program_id', programId)
        .order('order_index', { ascending: true })
      if (cancelled) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMembers((data ?? []) as any)
      setLoadingMembers(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, programId, supabase])

  // Reset transient form fields when the modal closes / opens fresh.
  useEffect(() => {
    if (open) return
    setStartDate('')
    setEndDate('')
    setCycleAnchor('')
    setNotes('')
    setShowSchedule(false)
    setBulkMode(false)
    setBulkSelected(new Set())
  }, [open])

  const hasCycleMember = members.some(m => m.workout?.cycle_length && m.workout?.cycle_position)

  const handleAssign = async () => {
    const targetIds = bulkMode ? Array.from(bulkSelected) : clientId ? [clientId] : []
    if (targetIds.length === 0) {
      showToast(
        bulkMode ? 'Pick at least one person to assign to' : 'Please select someone to assign to',
        'error'
      )
      return
    }
    if (members.length === 0) {
      showToast('This program has no workouts', 'error')
      return
    }
    setAssigning(true)
    try {
      const startVal = showSchedule && startDate ? startDate : null
      const endVal = showSchedule && endDate ? endDate : null
      const anchorFallback = hasCycleMember ? cycleAnchor || todayISO() : null

      const workoutRows = targetIds.flatMap(targetId =>
        members
          .filter(m => m.workout)
          .map(m => ({
            workout_id: m.workout!.id,
            client_id: targetId,
            coach_id: coachId,
            start_date: startVal,
            end_date: endVal,
            // Cycle anchor only meaningful if the workout uses cycle scheduling.
            cycle_anchor_date:
              m.workout!.cycle_length && m.workout!.cycle_position
                ? anchorFallback
                : null,
            notes: notes || null,
          }))
      )

      // Skip dupes if the client already had any of these workouts assigned.
      const { error } = await supabase
        .from('workout_assignments')
        .upsert(workoutRows, { onConflict: 'workout_id,client_id', ignoreDuplicates: true })
      if (error) throw error

      // Record the program-level assignment so adding a workout to the
      // program later can auto-fan-out to this client. Best-effort — if the
      // table doesn't exist on this deployment yet, the assign still succeeds.
      try {
        const programRows = targetIds.map(targetId => ({
          program_id: programId,
          client_id: targetId,
          coach_id: coachId,
          cycle_anchor_date: anchorFallback,
        }))
        // ignoreDuplicates so re-clicking Assign on an already-assigned client
        // doesn't overwrite the original anchor (which would shift the
        // rotation phase for cycle workouts mid-program).
        await supabase
          .from('program_assignments')
          .upsert(programRows, {
            onConflict: 'program_id,client_id',
            ignoreDuplicates: true,
          })
      } catch {
        // Tracking row is non-essential for the assign itself.
      }

      const peopleLabel =
        targetIds.length === 1 ? '1 person' : `${targetIds.length} people`
      const workoutLabel =
        members.length === 1 ? 'workout' : 'workouts'
      showToast(
        `Program assigned to ${peopleLabel} (${members.length} ${workoutLabel} each)`
      )
      onClose()
    } catch {
      showToast('Failed to assign program', 'error')
    } finally {
      setAssigning(false)
    }
  }

  const toggleBulkPick = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal open={open} title="Assign Program" onClose={onClose}>
      <div className="mb-4 px-3 py-2 bg-indigo-soft border border-indigo-line rounded-lg flex items-center gap-2">
        <ListChecks size={16} className="text-indigo-fg shrink-0" />
        <p className="text-sm text-indigo-fg font-medium truncate">{programName}</p>
      </div>

      <div className="mb-5 px-3 py-2 bg-elevated border border-line rounded-lg">
        {loadingMembers ? (
          <p className="text-xs text-subtle">Loading workouts…</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-muted italic">
            This program doesn’t have any workouts yet.
          </p>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-subtle mb-1">
              Will assign {members.length}{' '}
              {members.length === 1 ? 'workout' : 'workouts'}
            </p>
            <ol className="text-xs text-foreground space-y-0.5">
              {members.map((m, i) => (
                <li key={m.workout_id} className="truncate">
                  <span className="text-subtle mr-1 tabular-nums">{i + 1}.</span>
                  {m.workout?.name ?? '(deleted workout)'}
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-subtle mt-2">
              Workouts already assigned to this person will be left as-is.
            </p>
          </>
        )}
      </div>

      <div className="space-y-4">
        {/* Bulk toggle. Hidden if the modal was opened from a client
            detail view (preselectedClientId set) — that flow is implicitly
            single-target and a checklist would just confuse the user. */}
        {!preselectedClientId && (
          <button
            type="button"
            onClick={() => {
              setBulkMode(v => {
                const next = !v
                // Seed the bulk set with whatever the dropdown had so
                // toggling on doesn't lose context.
                if (next && clientId) {
                  setBulkSelected(prev => {
                    const s = new Set(prev)
                    s.add(clientId)
                    return s
                  })
                }
                return next
              })
            }}
            className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-fg hover:text-indigo-fg-strong cursor-pointer"
          >
            <Users size={14} />
            {bulkMode ? 'Switch to single assignee' : 'Assign to multiple people'}
          </button>
        )}
        {bulkMode ? (
          <Field id="pa-bulk" label={`Assign to (${bulkSelected.size} selected)`}>
            {loadingRoster ? (
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 bg-line/70 rounded-md animate-pulse" />
                ))}
              </div>
            ) : roster.length === 0 ? (
              <p className="text-xs text-muted italic">
                No clients yet — invite some first.
              </p>
            ) : (
              <div className="border border-line rounded-md max-h-56 overflow-y-auto divide-y divide-line-subtle">
                {roster.map(person => {
                  const checked = bulkSelected.has(person.id)
                  return (
                    <label
                      key={person.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-elevated"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBulkPick(person.id)}
                        className="h-4 w-4 rounded border-line accent-indigo-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {person.label}
                        </p>
                        {person.hint && (
                          <p className="text-[11px] text-subtle truncate">{person.hint}</p>
                        )}
                      </div>
                      {person.isSelf && (
                        <span className="text-[9px] uppercase tracking-widest text-subtle">
                          You
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            )}
            {roster.length > 1 && (
              <div className="mt-2 flex items-center gap-3 text-[11px]">
                <button
                  type="button"
                  onClick={() => setBulkSelected(new Set(roster.map(r => r.id)))}
                  className="text-indigo-fg hover:text-indigo-fg-strong cursor-pointer"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setBulkSelected(new Set())}
                  className="text-muted hover:text-foreground cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </Field>
        ) : (
          <AssigneePicker
            coachId={coachId}
            value={clientId}
            onChange={setClientId}
            preselectedClientId={preselectedClientId}
          />
        )}

        {hasCycleMember && (
          <Field id="pa-anchor" label="Day 1 of any rotations in this program">
            <DatePicker
              id="pa-anchor"
              value={cycleAnchor}
              onChange={setCycleAnchor}
              placeholder="Today"
              allowClear
            />
            <p className="text-[11px] text-muted mt-1">
              Cycle workouts in this program will use this anchor. Defaults to today.
            </p>
          </Field>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowSchedule(!showSchedule)}
            className="flex items-center gap-2 text-sm text-muted hover:text-foreground cursor-pointer"
          >
            <Calendar size={14} />
            {showSchedule ? 'Hide schedule' : 'Schedule (optional)'}
          </button>
          {!showSchedule && (
            <p className="text-xs text-subtle mt-1 ml-6">
              Active immediately, no end date. Each workout uses its own days/cycle.
            </p>
          )}
          {showSchedule && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field id="pa-start" label="Start" optional>
                <DatePicker
                  id="pa-start"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Today"
                  allowClear
                />
              </Field>
              <Field id="pa-end" label="End" optional>
                <DatePicker
                  id="pa-end"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="No end"
                  allowClear
                />
              </Field>
            </div>
          )}
        </div>

        <Field id="pa-notes" label="Notes" optional>
          <Textarea
            id="pa-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any specific instructions..."
            rows={3}
          />
        </Field>

        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleAssign}
            loading={assigning}
            disabled={
              members.length === 0 ||
              (bulkMode ? bulkSelected.size === 0 : !clientId)
            }
            className="flex-1"
          >
            {assigning
              ? 'Assigning…'
              : bulkMode && bulkSelected.size > 1
                ? `Assign to ${bulkSelected.size}`
                : 'Assign Program'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
