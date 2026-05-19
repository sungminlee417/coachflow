'use client'

import { Save } from 'lucide-react'
import { Button } from './Button'
import { UnsavedBadge } from './UnsavedBadge'

/**
 * Sticky bottom action bar for every builder (MealPlan, Workout,
 * Program). Renders:
 *   • a spacer above the bar so the last form row never hides under it
 *   • the bar itself, fixed to the viewport, respecting the mobile
 *     bottom-tab nav (`bottom-[calc(env(safe-area-inset-bottom)+3.5rem)]`)
 *     and the desktop sidebar (`md:left-64`)
 *   • count + UnsavedBadge on the left, Cancel + Save on the right
 *
 * `saveLabel` is the full text shown at sm+ (e.g. "Save Meal Plan");
 * `shortSaveLabel` defaults to "Save" and replaces the full text on
 * phones so Cancel + Save fit alongside the unsaved-changes pill.
 */
export function BuilderSaveBar({
  count,
  noun,
  isDirty,
  saving,
  onCancel,
  onSave,
  saveLabel,
  shortSaveLabel = 'Save',
}: {
  count: number
  /** Singular form; pluralised by appending "s" for >1 (matches the
   *  existing in-place callsites — none of them have irregular plurals
   *  in this surface). */
  noun: string
  isDirty: boolean
  saving: boolean
  onCancel: () => void
  onSave: () => void
  saveLabel: string
  shortSaveLabel?: string
}) {
  return (
    <>
      {/* Spacer keeps the last card clear of the fixed save bar. Taller
          on mobile because the bar sits above the ~3.5rem bottom tab nav. */}
      <div className="h-32 md:h-24" aria-hidden />

      <div className="fixed left-0 right-0 md:left-64 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] md:bottom-0 z-30 pt-3 pb-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface/95 backdrop-blur-md border-t border-line shadow-[0_-6px_20px_-8px_rgba(15,23,42,0.12)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted">
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{count}</span>{' '}
              {count === 1 ? noun : `${noun}s`}
            </span>
            <UnsavedBadge visible={isDirty && !saving} />
          </div>
          <div className="sm:hidden">
            <UnsavedBadge visible={isDirty && !saving} />
          </div>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onCancel} disabled={saving} size="sm">
            Cancel
          </Button>
          <Button
            onClick={onSave}
            loading={saving}
            disabled={!isDirty}
            size="sm"
          >
            {!saving && <Save size={14} />}
            {saving ? (
              'Saving…'
            ) : (
              <>
                <span className="sm:hidden">{shortSaveLabel}</span>
                <span className="hidden sm:inline">{saveLabel}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
