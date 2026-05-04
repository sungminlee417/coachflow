import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
}

export function Card({ interactive, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 ${
        interactive ? 'hover:border-indigo-200 hover:shadow-md transition-all' : ''
      } ${className}`}
      {...props}
    />
  )
}
