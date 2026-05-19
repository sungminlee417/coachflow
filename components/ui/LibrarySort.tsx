'use client'

import { ArrowDownUp } from 'lucide-react'

export type LibrarySortMode = 'recent' | 'alpha' | 'template'

export interface LibrarySortOption {
  value: LibrarySortMode
  label: string
}

const DEFAULT_OPTIONS: LibrarySortOption[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'alpha', label: 'A → Z' },
  { value: 'template', label: 'Templates first' },
]

interface LibrarySortProps {
  value: LibrarySortMode
  onChange: (next: LibrarySortMode) => void
  options?: LibrarySortOption[]
  className?: string
}

/**
 * Compact sort selector for the coach-side library lists. Pairs with
 * `LibrarySearch` — when the list has enough rows to warrant searching,
 * sorting is usually relevant too. Sites that don't have a `is_template`
 * column can pass a trimmed `options` array.
 */
export function LibrarySort({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  className = '',
}: LibrarySortProps) {
  return (
    <div className={`relative ${className}`}>
      <ArrowDownUp
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"
      />
      <select
        value={value}
        onChange={e => onChange(e.target.value as LibrarySortMode)}
        aria-label="Sort"
        className="appearance-none w-full pl-9 pr-8 py-2.5 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Sort a list by the chosen mode. Stable per mode:
 *   • recent → `created_at` DESC (most recent first)
 *   • alpha → `name` A→Z, case-insensitive
 *   • template → `is_template` first, then `created_at` DESC
 *
 * Callers that pass a list without `created_at` get a stable input order
 * for the 'recent' bucket.
 */
export function sortLibrary<
  T extends { name: string; created_at?: string; is_template?: boolean | null },
>(items: T[], mode: LibrarySortMode): T[] {
  const sorted = [...items]
  if (mode === 'alpha') {
    sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return sorted
  }
  if (mode === 'template') {
    sorted.sort((a, b) => {
      const aT = a.is_template ? 1 : 0
      const bT = b.is_template ? 1 : 0
      if (aT !== bT) return bT - aT // templates first
      const aC = a.created_at ?? ''
      const bC = b.created_at ?? ''
      return bC.localeCompare(aC)
    })
    return sorted
  }
  // 'recent' (default)
  sorted.sort((a, b) => {
    const aC = a.created_at ?? ''
    const bC = b.created_at ?? ''
    return bC.localeCompare(aC)
  })
  return sorted
}
