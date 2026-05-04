'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { Calendar, X } from 'lucide-react'
import 'react-day-picker/style.css'

interface DatePickerProps {
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
  placeholder?: string
  allowClear?: boolean
  id?: string
  className?: string
}

const toLocalISO = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const parseLocalISO = (s: string): Date | undefined => {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

const formatPretty = (s: string): string => {
  const d = parseLocalISO(s)
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  allowClear,
  id,
  className = '',
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [open])

  const selected = parseLocalISO(value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors cursor-pointer ${
          value ? 'text-slate-900' : 'text-slate-400'
        }`}
      >
        <Calendar size={16} className="text-slate-400 flex-shrink-0" />
        <span className="flex-1 text-left truncate">
          {value ? formatPretty(value) : placeholder}
        </span>
        {allowClear && value && (
          <span
            role="button"
            aria-label="Clear date"
            onClick={e => {
              e.stopPropagation()
              onChange('')
            }}
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={14} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl p-3 left-0"
          style={
            {
              // react-day-picker v9 theme variables
              '--rdp-accent-color': '#4f46e5',
              '--rdp-accent-background-color': '#4f46e5',
              '--rdp-day-height': '2.25rem',
              '--rdp-day-width': '2.25rem',
              '--rdp-font-family': 'inherit',
              '--rdp-day_button-border-radius': '0.5rem',
              '--rdp-selected-border': '0',
              '--rdp-today-color': '#4f46e5',
              '--rdp-weekday-text-transform': 'uppercase',
              '--rdp-weekday-font-size': '0.625rem',
              '--rdp-weekday-opacity': '0.6',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any
          }
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={d => {
              if (d) {
                onChange(toLocalISO(d))
                setOpen(false)
              }
            }}
            showOutsideDays
          />
        </div>
      )}
    </div>
  )
}
