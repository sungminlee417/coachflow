'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { useAssignmentSync } from '@/lib/hooks/use-assignment-sync'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'

interface EditMealPlanScheduleModalProps {
  open: boolean
  coachId: string
  assignmentId: string
  planName: string
  initialStartDate: string | null
  initialEndDate: string | null
  onClose: () => void
}

export default function EditMealPlanScheduleModal({
  open,
  coachId,
  assignmentId,
  planName,
  initialStartDate,
  initialEndDate,
  onClose,
}: EditMealPlanScheduleModalProps) {
  const supabase = useSupabase()
  const { invalidateMealPlans } = useAssignmentSync()
  const [startDate, setStartDate] = useState(initialStartDate ?? '')
  const [endDate, setEndDate] = useState(initialEndDate ?? '')
  const [saving, setSaving] = useState(false)

  // Reset to latest initial values whenever the modal opens for a (possibly
  // different) assignment.
  useEffect(() => {
    if (open) {
      setStartDate(initialStartDate ?? '')
      setEndDate(initialEndDate ?? '')
    }
  }, [open, initialStartDate, initialEndDate])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('meal_plan_assignments')
        .update({
          start_date: startDate || null,
          end_date: endDate || null,
        })
        .eq('id', assignmentId)
      if (error) throw error
      await invalidateMealPlans({ coachId })
      showToast('Schedule updated')
      onClose()
    } catch {
      showToast('Failed to update schedule', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Edit Schedule" onClose={onClose}>
      <div className="mb-5 px-3 py-2 bg-emerald-soft border border-emerald-line rounded-lg">
        <p className="text-sm text-emerald-fg font-medium">{planName}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Field id="edit-mpa-start" label="Start" optional>
          <DatePicker
            id="edit-mpa-start"
            value={startDate}
            onChange={setStartDate}
            placeholder="No start"
            allowClear
          />
        </Field>
        <Field id="edit-mpa-end" label="End" optional>
          <DatePicker
            id="edit-mpa-end"
            value={endDate}
            onChange={setEndDate}
            placeholder="No end"
            allowClear
            align="right"
          />
        </Field>
      </div>

      <p className="text-xs text-subtle mb-5">
        Leave both blank to keep the plan active on all days with no time limit.
      </p>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  )
}
