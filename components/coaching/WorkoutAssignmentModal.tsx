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
  const [showSchedule, setShowSchedule] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [assigning, setAssigning] = useState(false)

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

        <div>
          <button
            type="button"
            onClick={() => setShowSchedule(!showSchedule)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <Calendar size={14} />
            {showSchedule ? 'Hide schedule' : 'Schedule (optional)'}
          </button>
          {!showSchedule && (
            <p className="text-xs text-slate-400 mt-1 ml-6">
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
          <Button onClick={handleAssign} disabled={assigning || !clientId} className="flex-1">
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
