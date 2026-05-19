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

interface MealPlanAssignmentModalProps {
  open: boolean
  coachId: string
  mealPlanId: string
  mealPlanName: string
  preselectedClientId?: string
  onClose: () => void
}

export default function MealPlanAssignmentModal({
  open,
  coachId,
  mealPlanId,
  mealPlanName,
  preselectedClientId,
  onClose,
}: MealPlanAssignmentModalProps) {
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
      // Check for existing assignment of this plan to this client.
      const { data: existing } = await supabase
        .from('meal_plan_assignments')
        .select('id')
        .eq('meal_plan_id', mealPlanId)
        .eq('client_id', clientId)
        .maybeSingle()

      if (existing) {
        showToast('This meal plan is already assigned to that person', 'error')
        return
      }

      const { error } = await supabase.from('meal_plan_assignments').insert({
        meal_plan_id: mealPlanId,
        client_id: clientId,
        coach_id: coachId,
        start_date: showSchedule && startDate ? startDate : null,
        end_date: showSchedule && endDate ? endDate : null,
        notes,
      })
      if (error) {
        // Catch race conditions where the unique index rejects a second insert.
        if ((error as { code?: string }).code === '23505') {
          showToast('This meal plan is already assigned to that person', 'error')
          return
        }
        throw error
      }
      showToast('Meal plan assigned successfully!')
      onClose()
    } catch {
      showToast('Failed to assign meal plan', 'error')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <Modal open={open} title="Assign Meal Plan" onClose={onClose}>
      <div className="mb-5 px-3 py-2 bg-indigo-soft border border-indigo-line rounded-lg">
        <p className="text-sm text-indigo-fg font-medium">{mealPlanName}</p>
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
            className="flex items-center gap-2 text-sm text-muted hover:text-foreground cursor-pointer"
          >
            <Calendar size={14} />
            {showSchedule ? 'Hide schedule' : 'Schedule (optional)'}
          </button>
          {!showSchedule && (
            <p className="text-xs text-subtle mt-1 ml-6">
              Active immediately, no end date. Meals appear on their tagged days of the week.
            </p>
          )}
          {showSchedule && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field id="mpa-start" label="Start" optional>
                <DatePicker
                  id="mpa-start"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Today"
                  allowClear
                />
              </Field>
              <Field id="mpa-end" label="End" optional>
                <DatePicker
                  id="mpa-end"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="No end"
                  allowClear
                />
              </Field>
            </div>
          )}
        </div>

        <Field id="mpa-notes" label="Notes" optional>
          <Textarea
            id="mpa-notes"
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
            {assigning ? 'Assigning...' : 'Assign Meal Plan'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
