'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { roundMacro } from '@/lib/utils'
import type { Ingredient } from '@/lib/types'
import type { IngredientCatalogEntry } from '@/lib/hooks/use-ingredient-catalog'
import { QuantityInput } from './QuantityInput'
import { MacroInput } from './MacroInputs'

export interface IngredientRowProps {
  ingredient: Ingredient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (field: keyof Ingredient, value: any) => void
  /** Bulk replace name + quantity + macros in a single state update.
   *  Used by the autocomplete pick — avoids six per-field renders. */
  onPickSuggestion?: (next: {
    name: string
    quantity: string
    calories: number | null
    protein_grams: number | null
    carbs_grams: number | null
    fat_grams: number | null
  }) => void
  /** Optional autocomplete source. Omit to disable suggestions
   *  (FoodAlternative reuse keeps the row but without the coach's
   *  ingredient catalog — those are subs, not new entries). */
  catalog?: IngredientCatalogEntry[]
  onRemove: () => void
}

export function IngredientRow({
  ingredient,
  onChange,
  onPickSuggestion,
  catalog,
  onRemove,
}: IngredientRowProps) {
  // Mobile layout (stacked rows):
  //   Row 1: Name (with trailing delete button)
  //   Row 2: Qty + macros in a 5-up sub-grid so each cell gets ~60px of
  //          typing room instead of the ~54px the prior 12-col layout
  //          left after the input's px-3 padding.
  // Desktop (md+): everything in one tight 12-col row.
  return (
    <div className="bg-white rounded-md p-1.5 border border-slate-200 md:grid md:grid-cols-12 md:gap-1.5 md:items-center space-y-1.5 md:space-y-0">
      <div className="md:col-span-4 flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <IngredientNameField
            value={ingredient.name}
            catalog={catalog}
            onChange={v => onChange('name', v)}
            onPick={entry => {
              if (onPickSuggestion) onPickSuggestion(entry)
              else onChange('name', entry.name)
            }}
          />
        </div>
        <div className="md:hidden">
          <IconButton tone="danger" onClick={onRemove} aria-label="Remove ingredient">
            <X size={12} />
          </IconButton>
        </div>
      </div>
      <div className="md:col-span-3">
        <QuantityInput
          value={ingredient.quantity}
          onChange={v => onChange('quantity', v)}
        />
      </div>
      {/* `md:contents` makes the wrapper layout-invisible at md+ so the
          four MacroInputs flow as direct children of the outer 12-col
          grid (each takes col-span-1). On mobile the wrapper is a 4-col
          sub-grid filling the full row, giving each cell ~70px instead
          of the cramped ~78px (minus padding) the prior layout left. */}
      <div className="md:contents grid grid-cols-4 gap-1.5">
        <MacroInput
          value={ingredient.calories ?? ''}
          placeholder="Cal"
          onChange={v => onChange('calories', v)}
        />
        <MacroInput
          value={ingredient.protein_grams ?? ''}
          placeholder="P"
          onChange={v => onChange('protein_grams', v)}
        />
        <MacroInput
          value={ingredient.carbs_grams ?? ''}
          placeholder="C"
          onChange={v => onChange('carbs_grams', v)}
        />
        <MacroInput
          value={ingredient.fat_grams ?? ''}
          placeholder="F"
          onChange={v => onChange('fat_grams', v)}
        />
      </div>
      <div className="hidden md:flex md:col-span-1 justify-end">
        <IconButton tone="danger" onClick={onRemove} aria-label="Remove ingredient">
          <X size={12} />
        </IconButton>
      </div>
    </div>
  )
}

// Ingredient name with type-ahead pulled from the coach's own
// previously-saved ingredients. Picking a suggestion bulk-fills the
// whole row (qty + macros) via `onPick` so the user doesn't re-enter
// the same chicken-breast numbers fifteen times.
function IngredientNameField({
  value,
  catalog,
  onChange,
  onPick,
}: {
  value: string
  catalog?: IngredientCatalogEntry[]
  onChange: (next: string) => void
  onPick: (entry: IngredientCatalogEntry) => void
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    if (!catalog || catalog.length === 0) return []
    const q = value.trim().toLowerCase()
    if (!q) return []
    const matched = catalog
      .filter(e => e.name.toLowerCase().includes(q))
      .slice(0, 8)
    if (matched.length === 1 && matched[0].name.toLowerCase() === q) return []
    return matched
  }, [catalog, value])

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
        onPick(pick)
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={e => {
          onChange(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder="Ingredient"
        className="text-xs py-1.5"
        autoComplete="off"
      />
      {showDropdown && (
        <ul
          // Absolute so the dropdown can spill out of the row's
          // overflow context. z-20 stacks above sibling rows.
          className="absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto bg-white rounded-md border border-slate-200 shadow-lg z-20 text-xs"
          role="listbox"
        >
          {suggestions.map((entry, i) => (
            <li key={entry.name} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                // `mousedown` not `click` — click fires after blur,
                // and our blur handler would close the dropdown first.
                onMouseDown={e => {
                  e.preventDefault()
                  onPick(entry)
                  setOpen(false)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-2.5 py-1.5 cursor-pointer ${
                  i === highlight ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <p className="font-medium text-slate-900 truncate">
                  {entry.name}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                  {[
                    entry.quantity || null,
                    entry.calories != null ? `${roundMacro(entry.calories)} cal` : null,
                    entry.protein_grams != null
                      ? `P ${roundMacro(entry.protein_grams)}g`
                      : null,
                    entry.carbs_grams != null
                      ? `C ${roundMacro(entry.carbs_grams)}g`
                      : null,
                    entry.fat_grams != null
                      ? `F ${roundMacro(entry.fat_grams)}g`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
