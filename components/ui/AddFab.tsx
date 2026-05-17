'use client'

import { Plus } from 'lucide-react'

/**
 * Mobile-only floating "+" FAB. Anchored bottom-right above the
 * builder's sticky save bar so users deep in a long form can add
 * another item without scrolling all the way down.
 *
 * Desktop is `hidden` because the page-header `Add X` button stays
 * visible on a wider viewport — no need for a second affordance.
 */
export function AddFab({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      // 7.5rem = save-bar height + the ~3.5rem mobile tab nav + a
      // half-rem of breathing room. Keeps the FAB above both.
      className="md:hidden fixed right-4 z-40 h-12 w-12 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 7.5rem)' }}
    >
      <Plus size={22} />
    </button>
  )
}
