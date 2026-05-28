'use client'

// "Search + Sort + Grid" wrapper shared by WorkoutLibrary, MealPlanLibrary,
// ProgramLibrary, and ClientList. Each one used to inline the same 20-line
// "show controls when items > 4, render the no-match line otherwise, drop
// into a responsive grid" block. Centralising it means tweaks to the
// search threshold or grid breakpoints land in one file.
//
// Per-library customisation flows through props:
//   - `searchPlaceholder` / `emptyMatchLabel` keep the per-domain copy
//   - `sortOptions` lets ClientList drop the "Templates" option
//   - `showFilters` is computed from `total` here (>4 items) but
//     overridable so a caller can force-show / force-hide.

import { LibrarySearch } from './LibrarySearch'
import { LibrarySort, type LibrarySortMode, type LibrarySortOption } from './LibrarySort'

interface LibraryFilterableGridProps {
  total: number
  visibleCount: number
  query: string
  onQueryChange: (next: string) => void
  sortMode: LibrarySortMode
  onSortChange: (next: LibrarySortMode) => void
  searchPlaceholder: string
  /** Copy used in the "No <thing> match …" empty-search-result line. */
  emptyMatchLabel: string
  /** Override the per-library sort options (defaults: recent / alpha /
   *  templates). ClientList trims `templates`. */
  sortOptions?: LibrarySortOption[]
  /** Force the search/sort row visible/hidden. Defaults: hidden when
   *  the list is short enough that filtering wouldn't help. */
  showFilters?: boolean
  children: React.ReactNode
}

const FILTER_THRESHOLD = 4

export function LibraryFilterableGrid({
  total,
  visibleCount,
  query,
  onQueryChange,
  sortMode,
  onSortChange,
  searchPlaceholder,
  emptyMatchLabel,
  sortOptions,
  showFilters,
  children,
}: LibraryFilterableGridProps) {
  const filtersVisible = showFilters ?? total > FILTER_THRESHOLD
  return (
    <>
      {filtersVisible && (
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <LibrarySearch
            value={query}
            onChange={onQueryChange}
            placeholder={searchPlaceholder}
          />
          <LibrarySort
            value={sortMode}
            onChange={onSortChange}
            options={sortOptions}
            className="sm:w-48"
          />
        </div>
      )}
      {visibleCount === 0 ? (
        <p className="text-sm text-muted italic py-6 text-center">
          No {emptyMatchLabel} match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children}
        </div>
      )}
    </>
  )
}
