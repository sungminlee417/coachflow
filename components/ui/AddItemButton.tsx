'use client'

import { Plus } from 'lucide-react'

/**
 * Full-width dashed "+ Add X" button rendered at the bottom of each
 * builder's item list — saves a scroll back to the top after the user
 * adds a row to a long form. Mirror of the small `Add X` button in the
 * page header.
 */
export function AddItemButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50/40 transition-colors cursor-pointer text-sm font-medium"
    >
      <Plus size={16} />
      {label}
    </button>
  )
}
