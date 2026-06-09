'use client'

import { useState } from 'react'
import { showToast } from '@/components/ui/Toast'
import { useUpdateProfile } from '@/lib/hooks/use-profile'
import type { Profile, LengthUnit, WeightUnit } from '@/lib/types'

interface UnitToggleProps {
  profile: Profile
  onUpdate: (next: Partial<Profile>) => void
}

export function UnitToggle({ profile, onUpdate }: UnitToggleProps) {
  const [saving, setSaving] = useState(false)
  // Routing through the mutation hook also patches the `['profile', id]`
  // TanStack cache, so anything reading via `useProfile` (e.g. the
  // cardio pace label in ExerciseSetLogger that converts mph→pace
  // differently for lbs vs kg) re-renders immediately on unit change.
  // The raw `.update()` we used before left those readers stale.
  const updateProfile = useUpdateProfile(profile.id)

  const lengthUnit: LengthUnit = profile.length_unit ?? 'in'
  const weightUnit: WeightUnit = profile.weight_unit ?? 'lbs'

  const setUnit = async (patch: Partial<Profile>) => {
    onUpdate(patch)
    setSaving(true)
    try {
      await updateProfile.mutateAsync(patch)
    } catch {
      showToast('Failed to save unit preference', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <UnitGroup
        label="Length"
        value={lengthUnit}
        options={[
          { value: 'in', label: 'in' },
          { value: 'cm', label: 'cm' },
        ]}
        disabled={saving}
        onChange={v => setUnit({ length_unit: v as LengthUnit })}
      />
      <UnitGroup
        label="Weight"
        value={weightUnit}
        options={[
          { value: 'lbs', label: 'lbs' },
          { value: 'kg', label: 'kg' },
        ]}
        disabled={saving}
        onChange={v => setUnit({ weight_unit: v as WeightUnit })}
      />
    </div>
  )
}

interface UnitGroupProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled: boolean
  onChange: (value: string) => void
}

function UnitGroup({ label, value, options, disabled, onChange }: UnitGroupProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted font-medium">{label}</span>
      <div role="radiogroup" className="inline-flex bg-elevated rounded-lg p-0.5">
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
 active
 ? 'bg-surface text-indigo-fg shadow-sm'
 : 'text-muted hover:text-foreground '
 } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
