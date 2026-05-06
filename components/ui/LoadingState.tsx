import { Spinner } from './Spinner'

interface LoadingStateProps {
  label?: string
  /** Vertical padding size — 'page' for full pages, 'inline' for embedded sections. */
  size?: 'page' | 'inline'
}

export function LoadingState({ label = 'Loading…', size = 'page' }: LoadingStateProps) {
  const padding = size === 'page' ? 'py-16' : 'py-6'
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-slate-400 ${padding}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size={20} className="text-slate-400" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  )
}
