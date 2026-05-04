interface UnsavedBadgeProps {
  visible: boolean
}

export function UnsavedBadge({ visible }: UnsavedBadgeProps) {
  if (!visible) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Unsaved changes
    </span>
  )
}
