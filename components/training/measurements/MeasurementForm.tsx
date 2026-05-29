'use client'

import { useEffect, useState } from 'react'
import { useSaveBodyMeasurement } from '@/lib/hooks/use-body-measurements'
import { showToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
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
  body_fat_percent: null,
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
  const [data, setData] = useState<BodyMeasurement>(initial ?? emptyMeasurement())
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const saveMutation = useSaveBodyMeasurement(userId)
  const saving = saveMutation.isPending
  // Reset form state every time the modal is opened so editing pre-fills with
  // the right entry (and "Log entry" starts empty). Local-state mirror of
  // props — the React-19 lint rule's general "avoid setState in effect"
  // advice doesn't apply here because the modal owns mid-edit drafts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setData(initial ?? emptyMeasurement())
      setConfirmDiscard(false)
    }
  }, [open, initial])
  /* eslint-enable react-hooks/set-state-in-effect */
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

  const handleSave = () => {
    saveMutation.mutate(
      // Keep `initial.id` when editing; the hook treats absent id as insert.
      { ...data, id: initial?.id ?? undefined, user_id: userId },
      {
        onSuccess: () => {
          showToast(initial?.id ? 'Measurement updated' : 'Measurement logged')
          onClose()
        },
        onError: () => showToast('Failed to save measurement', 'error'),
      }
    )
  }

  return (
    <Modal open={open} title={initial ? 'Edit Measurement' : 'Log Measurement'} onClose={requestClose}>
      <div className="space-y-4">
        <Field id="m-date" label="Date">
          <DatePicker
            id="m-date"
            value={data.recorded_at}
            onChange={d => update('recorded_at', d)}
          />
        </Field>

        <Field id="m-bfp" label="Body fat %" optional>
          <div className="relative">
            <Input
              id="m-bfp"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="100"
              value={data.body_fat_percent ?? ''}
              onChange={e => {
                const raw = e.target.value
                if (raw === '') return update('body_fat_percent', null)
                const parsed = parseFloat(raw)
                // Bounds check at the input layer — bad data never
                // reaches the cache / network. Outside-range values fall
                // through as null so the field reads "empty" instead of
                // pinning to 100.
                if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
                  return update('body_fat_percent', null)
                }
                update('body_fat_percent', parsed)
              }}
              placeholder="e.g. 18.5"
              className="pr-10 tabular-nums"
            />
            <span
              aria-hidden
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-subtle"
            >
              %
            </span>
          </div>
          <p className="text-[10px] text-subtle mt-1">
            From DEXA, calipers, or a smart scale — any source is fine.
          </p>
        </Field>

        <p className="text-[10px] text-subtle">
          Circumference measurements below are in{' '}
          <span className="font-semibold text-muted">{lengthUnit}</span>
          {lengthUnit === 'in' ? ' — pick the whole inches and the fraction.' : '.'}
        </p>

        <div className="space-y-3">
          {FIELDS.map(({ key, flexedKey, label }) => {
            const isFlexed = flexedKey ? (data[flexedKey] as boolean) : false
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-sm text-foreground">{label}</label>
                  {flexedKey && (
                    <div
                      role="radiogroup"
                      aria-label={`${label} state`}
                      className="inline-flex bg-elevated rounded-lg p-0.5 text-xs"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!isFlexed}
                        onClick={() => update(flexedKey, false)}
                        className={`px-2.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
 !isFlexed
 ? 'bg-surface text-foreground shadow-sm'
 : 'text-muted hover:text-foreground '
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
 ? 'bg-surface text-indigo-fg shadow-sm'
 : 'text-muted hover:text-foreground '
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

      <div className="flex flex-wrap items-center gap-2 pt-4 mt-2 border-t border-line-subtle">
        <UnsavedBadge visible={isDirty && !saving} />
        <div className="flex-1" />
        <Button variant="secondary" onClick={requestClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={!isDirty}>
          {saving ? (
            'Saving…'
          ) : initial ? (
            <>
              <span className="sm:hidden">Save</span>
              <span className="hidden sm:inline">Save Changes</span>
            </>
          ) : (
            <>
              <span className="sm:hidden">Log</span>
              <span className="hidden sm:inline">Log Measurement</span>
            </>
          )}
        </Button>
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
