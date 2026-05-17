'use client'

import { ConfirmDialog } from './ConfirmDialog'

/**
 * Preset ConfirmDialog for the "unsaved edits — really leave?" flow that
 * every builder triggers from its back / cancel button. `noun` fills in
 * the message ("...edits to this workout..." / "...this meal plan...").
 */
export function DiscardDialog({
  open,
  noun,
  onConfirm,
  onCancel,
}: {
  open: boolean
  noun: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Discard changes?"
      message={`You have unsaved edits to this ${noun}. They'll be lost if you leave now.`}
      confirmLabel="Discard"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
