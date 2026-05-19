'use client'

import { useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { AssigneePicker } from '@/components/ui/AssigneePicker'
import { Calendar } from 'lucide-react'
import { todayISO } from '@/lib/utils'

interface WorkoutAssignmentModalProps {
  open: boolean
  coachId: string
  workoutId: string
  workoutName: string
  /** When set (>=1), the workout is on an N-day rotation and the modal asks
   *  for a cycle anchor date. */
  cycleLength?: number | null
  /** The workout's position within its rotation, used in helper copy. */
  cyclePosition?: number | null
  preselectedClientId?: string
  onClose: () => void
}

export default function WorkoutAssignmentModal({
  open,
  coachId,
  workoutId,
  workoutName,
  cycleLength,
  cyclePosition,
  preselectedClientId,
  onClose,
}: WorkoutAssignmentModalProps) {
  const supabase = useSupabase()
  const [clientId, setClientId] = useState(preselectedClientId ?? '')
  const [showSchedule, setShowSchedule] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cycleAnchor, setCycleAnchor] = useState('')
  const [notes, setNotes] = useState('')
  const [assigning, setAssigning] = useState(false)

  const isCycle = !!(cycleLength && cycleLength > 0)

  const handleAssign = async () => {
    if (!clientId) {
      showToast('Please select someone to assign to', 'error')
      return
    }

    setAssigning(true)
    try {
      // Prevent the same workout being assigned twice to the same person.
      const { data: existing } = await supabase
        .from('workout_assignments')
        .select('id')
        .eq('workout_id', workoutId)
        .eq('client_id', clientId)
        .maybeSingle()

      if (existing) {
        showToast('This workout is already assigned to that person', 'error')
        return
      }

      const { error } = await supabase.from('workout_assignments').insert({
        workout_id: workoutId,
        client_id: clientId,
        coach_id: coachId,
        start_date: showSchedule && startDate ? startDate : null,
        end_date: showSchedule && endDate ? endDate : null,
        cycle_anchor_date: isCycle ? cycleAnchor || todayISO() : null,
        notes,
      })
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          showToast('This workout is already assigned to that person', 'error')
          return
        }
        throw error
      }
      showToast('Workout assigned successfully!')
      onClose()
    } catch {
      showToast('Failed to assign workout', 'error')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <Modal open={open} title="Assign Workout" onClose={onClose}>
      <div className="mb-5 px-3 py-2 bg-indigo-soft border border-indigo-line rounded-lg">
        <p className="text-sm text-indigo-fg font-medium">{workoutName}</p>
      </div>

      <div className="space-y-4">
        <AssigneePicker
          coachId={coachId}
          value={clientId}
          onChange={setClientId}
          preselectedClientId={preselectedClientId}
        />

        {isCycle && (
          <Field id="wa-anchor" label={`Day 1 of the ${cycleLength}-day rotation`}>
            <DatePicker
              id="wa-anchor"
              value={cycleAnchor}
              onChange={setCycleAnchor}
              placeholder="Today"
              allowClear
            />
            <p className="text-[11px] text-muted mt-1">
              This workout is position {cyclePosition} of {cycleLength}. It will appear on
              the date you pick (and every {cycleLength} days after). Leave as today if the
              client is starting fresh.
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
              Active immediately, no end date. The workout appears on its tagged days of the week.
            </p>
          )}
          {showSchedule && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field id="wa-start" label="Start" optional>
                <DatePicker
                  id="wa-start"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Today"
                  allowClear
                />
              </Field>
              <Field id="wa-end" label="End" optional>
                <DatePicker
                  id="wa-end"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="No end"
                  allowClear
                />
              </Field>
            </div>
          )}
        </div>

        <Field id="wa-notes" label="Notes" optional>
          <Textarea
            id="wa-notes"
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
            disabled={!clientId}
            className="flex-1"
          >
            {assigning ? 'Assigning…' : 'Assign Workout'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
