'use client'

import { Input } from '@/components/ui/Input'
import type { LengthUnit } from '@/lib/types'

interface FractionInputProps {
  value: number | null
  onChange: (value: number | null) => void
  unit: LengthUnit
  placeholder?: string
}

// Eighth fractions of an inch.
const FRACTIONS: { value: number; label: string }[] = [
  { value: 0, label: '0' },
  { value: 0.125, label: '⅛' },
  { value: 0.25, label: '¼' },
  { value: 0.375, label: '⅜' },
  { value: 0.5, label: '½' },
  { value: 0.625, label: '⅝' },
  { value: 0.75, label: '¾' },
  { value: 0.875, label: '⅞' },
]

// Snap the value to the nearest 1/8 then split — this matches `formatLength` so
// the picker UI and the displayed string stay in lockstep on round-trips.
const splitValue = (value: number | null): { whole: string; fraction: number } => {
  if (value == null) return { whole: '', fraction: 0 }
  const eighths = Math.round(value * 8)
  const whole = Math.trunc(eighths / 8)
  const remainder = eighths - whole * 8
  return { whole: String(whole), fraction: remainder / 8 }
}

export function FractionInput({ value, onChange, unit, placeholder }: FractionInputProps) {
  if (unit !== 'in') {
    return (
      <Input
        type="number"
        step="any"
        min="0"
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        placeholder={placeholder ?? '35.5'}
        className="text-sm"
      />
    )
  }

  const { whole, fraction } = splitValue(value)

  const setWhole = (raw: string) => {
    if (raw === '') {
      onChange(null)
      return
    }
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) return
    onChange(n + fraction)
  }

  const setFraction = (frac: number) => {
    const w = whole === '' ? 0 : parseInt(whole, 10)
    onChange(w + frac)
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={whole}
        onChange={e => setWhole(e.target.value)}
        placeholder="0"
        className="text-sm w-20 text-center tabular-nums"
        aria-label="Whole inches"
      />
      <select
        value={String(fraction)}
        onChange={e => setFraction(parseFloat(e.target.value))}
        aria-label="Fraction of an inch"
        className="text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 hover:border-slate-400 transition-colors"
      >
        {FRACTIONS.map(f => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )
}
