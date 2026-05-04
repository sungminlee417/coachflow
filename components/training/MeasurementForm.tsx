'use client'

import { useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { useDirtyState } from '@/lib/use-dirty-state'
import { todayISO } from '@/lib/utils'
import type { BodyMeasurement } from '@/lib/types'

interface MeasurementFormProps {
  open: boolean
  userId: string
  initial: BodyMeasurement | null
  onClose: () => void
}

const emptyMeasurement = (): BodyMeasurement => ({
  recorded_at: todayISO(),
  neck: null,
  shoulders: null,
  waist: null,
  hips: null,
  chest: null,
  chest_flexed: false,
  thigh_left: null,
  thigh_left_flexed: false,
  thigh_right: null,
  thigh_right_flexed: false,
  calf_left: null,
  calf_left_flexed: false,
  calf_right: null,
  calf_right_flexed: false,
  arm_left: null,
  arm_left_flexed: false,
  arm_right: null,
  arm_right_flexed: false,
  notes: null,
})

const SIMPLE_FIELDS: { key: keyof BodyMeasurement; label: string }[] = [
  { key: 'neck', label: 'Neck' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'waist', label: 'Waist (at belly button)' },
  { key: 'hips', label: 'Hips (around glutes)' },
]

const FLEXIBLE_FIELDS: {
  key: keyof BodyMeasurement
  flexedKey: keyof BodyMeasurement
  label: string
}[] = [
  { key: 'chest', flexedKey: 'chest_flexed', label: 'Chest / Back' },
  { key: 'arm_left', flexedKey: 'arm_left_flexed', label: 'Left Arm' },
  { key: 'arm_right', flexedKey: 'arm_right_flexed', label: 'Right Arm' },
  { key: 'thigh_left', flexedKey: 'thigh_left_flexed', label: 'Left Thigh' },
  { key: 'thigh_right', flexedKey: 'thigh_right_flexed', label: 'Right Thigh' },
  { key: 'calf_left', flexedKey: 'calf_left_flexed', label: 'Left Calf' },
  { key: 'calf_right', flexedKey: 'calf_right_flexed', label: 'Right Calf' },
]

export default function MeasurementForm({ open, userId, initial, onClose }: MeasurementFormProps) {
  const supabase = useSupabase()
  const [data, setData] = useState<BodyMeasurement>(initial ?? emptyMeasurement())
  const [saving, setSaving] = useState(false)
  const isDirty = useDirtyState(data, true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (field: keyof BodyMeasurement, value: any) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...data, user_id: userId }
      delete payload.id // Supabase will assign on insert

      if (initial?.id) {
        const { error } = await supabase
          .from('body_measurements')
          .update(payload)
          .eq('id', initial.id)
        if (error) throw error
        showToast('Measurement updated')
      } else {
        const { error } = await supabase.from('body_measurements').insert(payload)
        if (error) throw error
        showToast('Measurement logged')
      }
      onClose()
    } catch {
      showToast('Failed to save measurement', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={initial ? 'Edit Measurement' : 'Log Measurement'} onClose={onClose}>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <Field id="m-date" label="Date">
          <DatePicker
            id="m-date"
            value={data.recorded_at}
            onChange={d => update('recorded_at', d)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {SIMPLE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <Input
                type="number"
                step="any"
                min="0"
                value={(data[key] as number | null) ?? ''}
                onChange={e =>
                  update(key, e.target.value ? parseFloat(e.target.value) : null)
                }
                className="text-sm"
              />
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Muscle measurements
          </p>
          {FLEXIBLE_FIELDS.map(({ key, flexedKey, label }) => {
            const isFlexed = data[flexedKey] as boolean
            return (
              <div key={key} className="grid grid-cols-12 gap-2 items-center">
                <label className="col-span-4 text-sm text-slate-700">{label}</label>
                <div className="col-span-3">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={(data[key] as number | null) ?? ''}
                    onChange={e =>
                      update(key, e.target.value ? parseFloat(e.target.value) : null)
                    }
                    className="text-sm"
                  />
                </div>
                <div
                  role="radiogroup"
                  aria-label={`${label} state`}
                  className="col-span-5 inline-flex bg-slate-100 rounded-lg p-0.5 text-xs"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isFlexed}
                    onClick={() => update(flexedKey, false)}
                    className={`flex-1 px-2 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      !isFlexed
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Relaxed
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isFlexed}
                    onClick={() => update(flexedKey, true)}
                    className={`flex-1 px-2 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                      isFlexed
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Flexed
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <Field id="m-notes" label="Notes" optional>
          <Textarea
            id="m-notes"
            value={data.notes ?? ''}
            onChange={e => update('notes', e.target.value || null)}
            placeholder="Anything notable..."
            rows={2}
          />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <UnsavedBadge visible={isDirty && !saving} />
          <div className="flex-1" />
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : initial ? 'Save Changes' : 'Log Measurement'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
