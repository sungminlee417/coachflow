'use client'

import { useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { AssigneePicker } from '@/components/ui/AssigneePicker'
import { todayISO } from '@/lib/utils'

interface WorkoutAssignmentModalProps {
  open: boolean
  coachId: string
  workoutId: string
  workoutName: string
  preselectedClientId?: string
  onClose: () => void
}

export default function WorkoutAssignmentModal({
  open,
  coachId,
  workoutId,
  workoutName,
  preselectedClientId,
  onClose,
}: WorkoutAssignmentModalProps) {
  const supabase = useSupabase()
  const [clientId, setClientId] = useState(preselectedClientId ?? '')
  const [assignedDate, setAssignedDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [assigning, setAssigning] = useState(false)

  const handleAssign = async () => {
    if (!clientId) {
      showToast('Please select someone to assign to', 'error')
      return
    }

    setAssigning(true)
    try {
      // Check for an existing assignment of the same workout on the same date.
      const { data: existing } = await supabase
        .from('workout_assignments')
        .select('id')
        .eq('workout_id', workoutId)
        .eq('client_id', clientId)
        .eq('assigned_date', assignedDate)
        .maybeSingle()

      if (existing) {
        showToast('This workout is already assigned for that day', 'error')
        return
      }

      const { error } = await supabase.from('workout_assignments').insert({
        workout_id: workoutId,
        client_id: clientId,
        coach_id: coachId,
        assigned_date: assignedDate,
        notes,
      })
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          showToast('This workout is already assigned for that day', 'error')
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
      <div className="mb-5 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
        <p className="text-sm text-indigo-700 font-medium">{workoutName}</p>
      </div>

      <div className="space-y-4">
        <AssigneePicker
          coachId={coachId}
          value={clientId}
          onChange={setClientId}
          preselectedClientId={preselectedClientId}
        />

        <Field id="wa-date" label="Date">
          <DatePicker id="wa-date" value={assignedDate} onChange={setAssignedDate} />
        </Field>

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
            disabled={assigning || !clientId}
            className="flex-1"
          >
            {assigning ? 'Assigning...' : 'Assign Workout'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
