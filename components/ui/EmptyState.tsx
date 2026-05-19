import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-surface rounded-xl border border-line p-12 text-center">
      <div className="w-12 h-12 bg-elevated rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon size={20} className="text-subtle" />
      </div>
      <p className="text-muted mb-1">{title}</p>
      {description && <p className="text-sm text-subtle mb-5">{description}</p>}
      {action}
    </div>
  )
}
