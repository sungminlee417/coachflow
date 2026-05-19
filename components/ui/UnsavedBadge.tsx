interface UnsavedBadgeProps {
  visible: boolean
}

export function UnsavedBadge({ visible }: UnsavedBadgeProps) {
  if (!visible) return null
  return (
    <span
      // Shorter label on phones — the save bar already packs Cancel +
      // a "Save X" primary button, so giving the badge ~140px for the
      // full "Unsaved changes" text squished everything else. On sm+
      // we have room for the full word.
      className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-fg bg-amber-soft border border-amber-line px-2 py-1 rounded-full whitespace-nowrap shrink-0"
      aria-label="Unsaved changes"
      title="Unsaved changes"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      <span className="sm:hidden">Unsaved</span>
      <span className="hidden sm:inline">Unsaved changes</span>
    </span>
  )
}
