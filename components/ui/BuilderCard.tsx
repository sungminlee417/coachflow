import type { ReactNode } from 'react'

/**
 * White rounded card with the standard slate-200 border. Used as the
 * top "details" section in every builder (name, description, template
 * toggle, etc.) and reusable elsewhere. The default padding + spacing
 * matches what the builders use; override via `className` if you need
 * tighter chrome.
 */
export function BuilderCard({
  children,
  className = 'p-6 mb-6 space-y-4',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`bg-surface rounded-xl border border-line ${className}`}>
      {children}
    </div>
  )
}
