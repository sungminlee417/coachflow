'use client'

import { useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import type { Profile, LengthUnit, WeightUnit } from '@/lib/types'

interface UnitToggleProps {
  profile: Profile
  onUpdate: (next: Partial<Profile>) => void
}

export function UnitToggle({ profile, onUpdate }: UnitToggleProps) {
  const supabase = useSupabase()
  const [saving, setSaving] = useState(false)

  const lengthUnit: LengthUnit = profile.length_unit ?? 'in'
  const weightUnit: WeightUnit = profile.weight_unit ?? 'lbs'

  const setUnit = async (patch: Partial<Profile>) => {
    onUpdate(patch)
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
      if (error) throw error
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
      <span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span>
      <div role="radiogroup" className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
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
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
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
