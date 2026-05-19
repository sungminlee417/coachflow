import { ButtonHTMLAttributes, forwardRef } from 'react'

type Tone = 'neutral' | 'danger'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone
  'aria-label': string
}

const toneClasses: Record<Tone, string> = {
  neutral:
    'text-slate-400 hover:text-slate-700 hover:bg-slate-100 ' +
    'dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800',
  danger:
    'text-slate-400 hover:text-red-600 hover:bg-red-50 ' +
    'dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-950/40',
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
