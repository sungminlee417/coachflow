'use client'

// Schedule (start + end date) + Notes field bundle shared by the three
// assignment modals (Workout, MealPlan, Program). Each used to inline
// 35-ish lines of identical Calendar toggle + DatePicker pair + Notes
// Textarea; consolidating them here also makes the "Active immediately"
// helper copy editable in one place.
//
// State is owned by the parent — this component is pure UI plus a
// disclosure toggle. Keeping the state outside keeps the existing
// validation / payload-building logic intact in each modal.

import { Calendar } from 'lucide-react'
import { Field, Textarea } from '@/components/ui/Input'
import { DatePicker } from '@/components/ui/DatePicker'

interface AssignmentSchedulingFieldsProps {
  /** Form id prefix — keeps the `<label>`/`<input>` association unique
   *  when multiple instances mount (rare, but the assign and reassign
   *  flows can coexist on screen). */
  idPrefix?: string
  startDate: string
  endDate: string
  onStartChange: (next: string) => void
  onEndChange: (next: string) => void
  notes: string
  onNotesChange: (next: string) => void
  /** Disclosure state lifted to the parent so it can decide whether
   *  to send a real date or null at submit time. */
  showSchedule: boolean
  onToggleSchedule: () => void
  /** Copy shown above the inputs when the disclosure is collapsed.
   *  Workout, meal plan, and program all phrase the default behaviour
   *  slightly differently. */
  collapsedHint: string
  /** Optional content rendered between the schedule disclosure and the
   *  Notes field — used by ProgramAssignmentModal to slot in the
   *  cycle-anchor date picker without breaking the layout. */
  extraAboveNotes?: React.ReactNode
}

export function AssignmentSchedulingFields({
  idPrefix = 'asn',
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  notes,
  onNotesChange,
  showSchedule,
  onToggleSchedule,
  collapsedHint,
  extraAboveNotes,
}: AssignmentSchedulingFieldsProps) {
  // The "actual" submitted dates depend on `showSchedule`: collapsing
  // the disclosure should NOT clear the inputs locally, but the caller
  // needs to treat them as null. The parent owns that decision.
  return (
    <>
      {extraAboveNotes}
      <div>
        <button
          type="button"
          onClick={onToggleSchedule}
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground cursor-pointer"
        >
          <Calendar size={14} />
          {showSchedule ? 'Hide schedule' : 'Schedule (optional)'}
        </button>
        {!showSchedule && (
          <p className="text-xs text-subtle mt-1 ml-6">{collapsedHint}</p>
        )}
        {showSchedule && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field id={`${idPrefix}-start`} label="Start" optional>
              <DatePicker
                id={`${idPrefix}-start`}
                value={startDate}
                onChange={onStartChange}
                placeholder="Today"
                allowClear
              />
            </Field>
            <Field id={`${idPrefix}-end`} label="End" optional>
              <DatePicker
                id={`${idPrefix}-end`}
                value={endDate}
                onChange={onEndChange}
                placeholder="No end"
                allowClear
              />
            </Field>
          </div>
        )}
      </div>

      <Field id={`${idPrefix}-notes`} label="Notes" optional>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Any specific instructions..."
          rows={3}
        />
      </Field>
    </>
  )
}

/** Caller-side helper: which value to send to the database when the
 *  schedule disclosure may have been collapsed. The components don't
 *  know `showSchedule` from the parent, so the parent owns this. */
export function scheduleValue(
  showSchedule: boolean,
  value: string
): string | null {
  return showSchedule && value ? value : null
}
