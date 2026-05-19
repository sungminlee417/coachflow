import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
}

export function Card({ interactive, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-xl border border-line ${
 interactive ? 'hover:border-indigo-line hover:shadow-md transition-all' : ''
 } ${className}`}
      {...props}
    />
  )
}
