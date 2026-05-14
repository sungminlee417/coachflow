'use client'

import { Search, X } from 'lucide-react'
import { Input } from './Input'

interface LibrarySearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * Small search input with a leading icon and a clear button. Used by
 * every coach-side library list (workouts, programs, meal plans,
 * clients) so name-filtering looks identical everywhere.
 */
export function LibrarySearch({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: LibrarySearchProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
      />
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9 text-sm"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
