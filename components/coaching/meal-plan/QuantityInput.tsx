'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/Input'

// Quantity = amount + unit. We serialize both into the existing
// `ingredient.quantity` string column (e.g. `"100 g"`, `"1 cup"`) to
// avoid a schema migration. Anything matching `<number> <text>` splits
// into the two inputs; legacy free-text values that don't match
// (`"1/2 cup"`, `"to taste"`) just live in the amount slot with the
// combobox showing whatever unit token was captured.
export const COMMON_UNITS = [
  'g',
  'oz',
  'ml',
  'cup',
  'tbsp',
  'tsp',
  'piece',
  'slice',
  'scoop',
] as const

export function parseQuantity(raw: string): { amount: string; unit: string } {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { amount: '', unit: '' }
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (!m) return { amount: '', unit: trimmed }
  return { amount: m[1], unit: m[2].trim() }
}

export function joinQuantity(amount: string, unit: string): string {
  const a = amount.trim()
  const u = unit.trim()
  if (!a && !u) return ''
  if (!u) return a
  if (!a) return u
  return `${a} ${u}`
}

export function QuantityInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const parsed = parseQuantity(value)
  return (
    <div className="grid grid-cols-[1fr_auto] gap-1">
      <Input
        // text + inputMode='decimal' so fractions like `1/2` still work
        // even though the dominant case is decimals.
        inputMode="decimal"
        value={parsed.amount}
        onChange={e => onChange(joinQuantity(e.target.value, parsed.unit))}
        placeholder="Qty"
        className="text-xs py-1.5 px-2"
      />
      <UnitCombobox
        value={parsed.unit}
        onChange={u => onChange(joinQuantity(parsed.amount, u))}
      />
    </div>
  )
}

// Type-and-pick combobox for the quantity unit. Always a text input —
// the dropdown is just suggestions filtered by what's already typed.
// Lets the coach type any custom unit (`scoop`, `to taste`, an internal
// abbreviation) without an "Other…" toggle, while still surfacing the
// common ones with a single tap.
function UnitCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    const matched = q
      ? (COMMON_UNITS as readonly string[]).filter(u =>
          u.toLowerCase().includes(q)
        )
      : (COMMON_UNITS as readonly string[])
    if (matched.length === 1 && matched[0].toLowerCase() === q) return []
    return matched
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const showDropdown = open && suggestions.length > 0

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      const pick = suggestions[highlight]
      if (pick) {
        e.preventDefault()
        onChange(pick)
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-20">
      <Input
        value={value}
        onChange={e => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder="unit"
        aria-label="Unit"
        autoComplete="off"
        className="text-xs py-1.5 px-2"
      />
      {showDropdown && (
        <ul
          className="absolute right-0 top-full mt-1 min-w-full max-h-56 overflow-y-auto bg-white rounded-md border border-slate-200 shadow-lg z-20 text-xs"
          role="listbox"
        >
          {suggestions.map((u, i) => (
            <li key={u} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  onChange(u)
                  setOpen(false)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-2.5 py-1.5 cursor-pointer ${
                  i === highlight ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                {u}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
