import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react'

// Shared classes for Input / Textarea / Select. All semantic tokens —
// the same string works in both themes because `bg-surface`, `text-foreground`,
// `border-line`, `placeholder:text-subtle`, and `disabled:bg-elevated`
// each resolve to the correct shade via the cascading CSS variables.
const fieldBase =
  'w-full px-3 py-2.5 bg-surface text-foreground border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-subtle disabled:bg-elevated disabled:cursor-not-allowed'

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
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {optional && <span className="text-subtle font-normal ml-1">(optional)</span>}
      </label>
      {children}
    </div>
  )
}
