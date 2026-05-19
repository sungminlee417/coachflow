'use client'

import { Input } from '@/components/ui/Input'
import { roundMacro } from '@/lib/utils'

// Single number cell shared by Cal/P/C/F. Tightened horizontal padding
// (`px-2` instead of the base `px-3`) so 3-digit values like `120` fit
// comfortably even at half-width on phones.
export function MacroInput({
  value,
  placeholder,
  onChange,
}: {
  value: number | string
  placeholder: string
  onChange: (v: number | null) => void
}) {
  return (
    <Input
      type="number"
      step="any"
      min="0"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : null)}
      placeholder={placeholder}
      className="text-xs py-1.5 px-2 md:col-span-1 text-center"
    />
  )
}

// Read-only "Cal: 250 · P: 30g · C: 12g · F: 8g" stamp used in the
// meal + food collapsed summaries.
export function MacroSummary({
  macros,
  className = '',
}: {
  macros: { calories: number; protein_grams: number; carbs_grams: number; fat_grams: number }
  className?: string
}) {
  return (
    <div className={`flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 ${className}`}>
      <span>
        <span className="text-slate-400 dark:text-slate-500">Cal:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.calories)}</span>
      </span>
      <span>
        <span className="text-slate-400 dark:text-slate-500">P:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.protein_grams)}g</span>
      </span>
      <span>
        <span className="text-slate-400 dark:text-slate-500">C:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.carbs_grams)}g</span>
      </span>
      <span>
        <span className="text-slate-400 dark:text-slate-500">F:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.fat_grams)}g</span>
      </span>
    </div>
  )
}
