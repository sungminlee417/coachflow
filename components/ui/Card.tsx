import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
}

export function Card({ interactive, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 ${
        interactive ? 'hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all' : ''
      } ${className}`}
      {...props}
    />
  )
}
