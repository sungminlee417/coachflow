import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react'

// Shared classes for Input / Textarea / Select. The dark variant uses
// `dark:bg-slate-900` to match card surfaces (inputs typically sit inside
// a white-in-light / slate-900-in-dark card), with a slightly lighter
// border and muted text/placeholder for readability against the dark
// surface. `dark:disabled:bg-slate-800` matches the slightly-lighter
// "muted" tone we use for nested badges in dark mode.
const fieldBase =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-400 disabled:bg-slate-50 disabled:cursor-not-allowed ' +
  'dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:placeholder:text-slate-500 dark:focus:border-indigo-400 dark:disabled:bg-slate-800'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${fieldBase} ${className}`} {...props} />
  }
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...props }, ref) {
    return <textarea ref={ref} className={`${fieldBase} ${className}`} {...props} />
  }
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', ...props }, ref) {
    return <select ref={ref} className={`${fieldBase} cursor-pointer ${className}`} {...props} />
  }
)

interface FieldProps {
  id: string
  label: string
  optional?: boolean
  children: React.ReactNode
}

export function Field({ id, label, optional, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
        {optional && <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">(optional)</span>}
      </label>
      {children}
    </div>
  )
}
