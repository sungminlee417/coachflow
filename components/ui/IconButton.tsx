import { ButtonHTMLAttributes, forwardRef } from 'react'

type Tone = 'neutral' | 'danger'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone
  'aria-label': string
}

const toneClasses: Record<Tone, string> = {
  neutral: 'text-slate-400 hover:text-slate-700 hover:bg-slate-100',
  danger: 'text-slate-400 hover:text-red-600 hover:bg-red-50',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = 'neutral', className = '', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`p-2 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${toneClasses[tone]} ${className}`}
      {...props}
    />
  )
})
