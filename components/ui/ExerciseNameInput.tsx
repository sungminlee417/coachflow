'use client'

import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react'
import { Input } from './Input'
import { searchCatalog, type CatalogEntry } from '@/lib/exercise-catalog'

interface ExerciseNameInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  /**
   * Called whenever the name changes — whether the user typed freely or
   * picked from the catalog. `catalogId` is the chosen catalog entry's id
   * when they picked from the dropdown, or null when they typed freeform.
   * Picking a suggestion always replaces the current freeform name.
   */
  onChange: (name: string, catalogId: string | null) => void
}

/**
 * Same look as a plain `<Input>`, but on focus / typing it shows a
 * dropdown of matching catalog exercises. Picking one stamps the catalog
 * id on the row so we can dereference equipment / muscles later. Typing
 * freeform still works exactly like the old plain input — the dropdown
 * just stays closed if nothing matches.
 */
export function ExerciseNameInput({
  value,
  onChange,
  ...inputProps
}: ExerciseNameInputProps) {
  const [open, setOpen] = useState(false)
  const [rawActiveIndex, setActiveIndex] = useState(0)
  const [matches, setMatches] = useState<CatalogEntry[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Catalog is dynamically imported on first focus — the JSON is ~200 KB
  // and we don't want it in the dashboard's initial chunk. Subsequent
  // searches are sync-fast (module-scoped cache). The race guard discards
  // results from stale queries when the user types faster than the
  // catalog's first load. `searchCatalog` already returns `[]` for empty
  // input, so we just await unconditionally — no sync setState on the
  // effect body, which the eslint plugin (rightly) flags as a re-render
  // hazard.
  useEffect(() => {
    let cancelled = false
    searchCatalog(value, 12).then(result => {
      if (!cancelled) setMatches(result)
    })
    return () => {
      cancelled = true
    }
  }, [value])

  // Clamp the highlighted row at usage time rather than resetting via an
  // effect — keeps the keyboard-nav state purely derived from current
  // inputs and avoids set-state-in-effect lint noise.
  const activeIndex =
    matches.length === 0 ? 0 : Math.min(rawActiveIndex, matches.length - 1)

  // Close the dropdown when the user clicks outside.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const showDropdown = open && matches.length > 0

  const pick = (entry: CatalogEntry) => {
    onChange(entry.name, entry.id)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // Only intercept Enter when the user is clearly navigating the
      // dropdown — let typed-only sessions submit forms as usual.
      e.preventDefault()
      pick(matches[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        {...inputProps}
        value={value}
        onChange={e => {
          onChange(e.target.value, null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
      />
      {showDropdown && (
        <div
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-line rounded-lg shadow-lg max-h-72 overflow-y-auto"
        >
          {matches.map((entry, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={e => {
                  // mousedown rather than click so the input doesn't lose
                  // focus before our handler runs.
                  e.preventDefault()
                  pick(entry)
                }}
                className={`w-full text-left px-3 py-2 cursor-pointer ${
 isActive ? 'bg-indigo-soft ' : 'hover:bg-elevated '
 }`}
              >
                <div className="text-sm font-medium text-foreground truncate">
                  {entry.name}
                </div>
                <div className="text-[11px] text-muted truncate">
                  {[entry.equipment, entry.primaryMuscles[0], entry.level]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
