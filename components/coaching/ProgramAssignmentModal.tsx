'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { AssigneePicker } from '@/components/ui/AssigneePicker'
import { Calendar, ListChecks } from 'lucide-react'
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
  }, [open])

  const hasCycleMember = members.some(m => m.workout?.cycle_length && m.workout?.cycle_position)

  const handleAssign = async () => {
    if (!clientId) {
      showToast('Please select someone to assign to', 'error')
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

      const rows = members
        .filter(m => m.workout)
        .map(m => ({
          workout_id: m.workout!.id,
          client_id: clientId,
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

      // Skip dupes if the client already had any of these workouts assigned.
      const { error } = await supabase
        .from('workout_assignments')
        .upsert(rows, { onConflict: 'workout_id,client_id', ignoreDuplicates: true })
      if (error) throw error

      // Record the program-level assignment so adding a workout to the
      // program later can auto-fan-out to this client. Best-effort — if the
      // table doesn't exist on this deployment yet, the assign still succeeds.
      try {
        // ignoreDuplicates so re-clicking Assign on an already-assigned client
        // doesn't overwrite the original anchor (which would shift the
        // rotation phase for cycle workouts mid-program).
        await supabase
          .from('program_assignments')
          .upsert(
            {
              program_id: programId,
              client_id: clientId,
              coach_id: coachId,
              cycle_anchor_date: anchorFallback,
            },
            { onConflict: 'program_id,client_id', ignoreDuplicates: true }
          )
      } catch {
        // Tracking row is non-essential for the assign itself.
      }

      showToast(`Program assigned (${rows.length} ${rows.length === 1 ? 'workout' : 'workouts'})`)
      onClose()
    } catch {
      showToast('Failed to assign program', 'error')
    } finally {
      setAssigning(false)
    }
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
        <AssigneePicker
          coachId={coachId}
          value={clientId}
          onChange={setClientId}
          preselectedClientId={preselectedClientId}
        />

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
            disabled={!clientId || members.length === 0}
            className="flex-1"
          >
            {assigning ? 'Assigning…' : 'Assign Program'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
