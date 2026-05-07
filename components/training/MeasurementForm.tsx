'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { FractionInput } from './FractionInput'
import { useDirtyState } from '@/lib/use-dirty-state'
import { todayISO } from '@/lib/utils'
import type { BodyMeasurement, LengthUnit } from '@/lib/types'

interface MeasurementFormProps {
  open: boolean
  userId: string
  initial: BodyMeasurement | null
  lengthUnit: LengthUnit
  onClose: () => void
}

const emptyMeasurement = (): BodyMeasurement => ({
  recorded_at: todayISO(),
  neck: null,
  waist: null,
  hips: null,
  shoulders: null,
  shoulders_flexed: false,
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

// One flat list, ordered roughly head-to-toe. `flexedKey` is set only on
// muscles where the relaxed/flexed distinction matters; non-muscle fields
// (neck, waist, hips) just omit it and get the same row layout.
const FIELDS: {
  key: keyof BodyMeasurement
  flexedKey?: keyof BodyMeasurement
  label: string
}[] = [
  { key: 'neck', label: 'Neck' },
  { key: 'shoulders', flexedKey: 'shoulders_flexed', label: 'Shoulders' },
  { key: 'chest', flexedKey: 'chest_flexed', label: 'Chest / back' },
  { key: 'arm_left', flexedKey: 'arm_left_flexed', label: 'Left arm' },
  { key: 'arm_right', flexedKey: 'arm_right_flexed', label: 'Right arm' },
  { key: 'waist', label: 'Waist (at belly button)' },
  { key: 'hips', label: 'Hips (around glutes)' },
  { key: 'thigh_left', flexedKey: 'thigh_left_flexed', label: 'Left thigh' },
  { key: 'thigh_right', flexedKey: 'thigh_right_flexed', label: 'Right thigh' },
  { key: 'calf_left', flexedKey: 'calf_left_flexed', label: 'Left calf' },
  { key: 'calf_right', flexedKey: 'calf_right_flexed', label: 'Right calf' },
]

export default function MeasurementForm({
  open,
  userId,
  initial,
  lengthUnit,
  onClose,
}: MeasurementFormProps) {
  const supabase = useSupabase()
  const [data, setData] = useState<BodyMeasurement>(initial ?? emptyMeasurement())
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Reset form state every time the modal is opened so editing pre-fills with
  // the right entry (and "Log entry" starts empty).
  useEffect(() => {
    if (open) {
      setData(initial ?? emptyMeasurement())
      setConfirmDiscard(false)
    }
  }, [open, initial])
  // Tie dirty-state ready flag to `open` so the snapshot resets per opening.
  const isDirty = useDirtyState(data, open)

  const requestClose = () => {
    if (isDirty && !saving) setConfirmDiscard(true)
    else onClose()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update = (field: keyof BodyMeasurement, value: any) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...data, user_id: userId }
      delete payload.id

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
    <Modal open={open} title={initial ? 'Edit Measurement' : 'Log Measurement'} onClose={requestClose}>
      <div className="flex flex-col max-h-[75vh] -mx-1">
      <div className="flex-1 overflow-y-auto px-1 space-y-4">
        <Field id="m-date" label="Date">
          <DatePicker
            id="m-date"
            value={data.recorded_at}
            onChange={d => update('recorded_at', d)}
          />
        </Field>

        <p className="text-[10px] text-slate-400">
          All measurements are <span className="font-semibold text-slate-600">circumference</span>
          {' '}in <span className="font-semibold text-slate-600">{lengthUnit}</span>
          {lengthUnit === 'in' ? ' — pick the whole inches and the fraction.' : '.'}
        </p>

        <div className="space-y-3">
          {FIELDS.map(({ key, flexedKey, label }) => {
            const isFlexed = flexedKey ? (data[flexedKey] as boolean) : false
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-sm text-slate-700">{label}</label>
                  {flexedKey && (
                    <div
                      role="radiogroup"
                      aria-label={`${label} state`}
                      className="inline-flex bg-slate-100 rounded-lg p-0.5 text-xs"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!isFlexed}
                        onClick={() => update(flexedKey, false)}
                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
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
                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                          isFlexed
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Flexed
                      </button>
                    </div>
                  )}
                </div>
                <FractionInput
                  value={data[key] as number | null}
                  onChange={v => update(key, v)}
                  unit={lengthUnit}
                />
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
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-4 mt-2 border-t border-slate-100 px-1">
        <UnsavedBadge visible={isDirty && !saving} />
        <div className="flex-1" />
        <Button variant="secondary" onClick={requestClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={!isDirty}>
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Log Measurement'}
        </Button>
      </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved measurement edits. They'll be lost if you leave now."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </Modal>
  )
}
