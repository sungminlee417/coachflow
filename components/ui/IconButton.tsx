import { ButtonHTMLAttributes, forwardRef } from 'react'

type Tone = 'neutral' | 'danger'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone
  'aria-label': string
}

const toneClasses: Record<Tone, string> = {
  neutral: 'text-subtle hover:text-foreground hover:bg-elevated',
  danger: 'text-subtle hover:text-red-fg hover:bg-red-soft',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = 'neutral', className = '', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      // 2.5 padding gives ~40px square on mobile (closer to the Apple 44pt
      // touch-target recommendation). Cluster-spacing risk is real on the
      // builder rows where multiple IconButtons sit side-by-side.
      className={`p-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${toneClasses[tone]} ${className}`}
      {...props}
    />
  )
})
