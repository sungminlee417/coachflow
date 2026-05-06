import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon size={20} className="text-slate-400" />
      </div>
      <p className="text-slate-500 mb-1">{title}</p>
      {description && <p className="text-sm text-slate-400 mb-5">{description}</p>}
      {action}
    </div>
  )
}
