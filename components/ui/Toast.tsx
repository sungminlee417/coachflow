'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

type ToastType = 'success' | 'error'

interface ToastMessage {
  id: number
  text: string
  type: ToastType
}

let toastId = 0
let addToastFn: ((text: string, type: ToastType) => void) | null = null

export function showToast(text: string, type: ToastType = 'success') {
  addToastFn?.(text, type)
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, type: ToastType) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => {
      addToastFn = null
    }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed left-4 right-4 bottom-4 sm:left-auto sm:right-4 sm:max-w-sm z-60 flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{ animation: 'slideUp 0.2s ease-out' }}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ring-1 ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white ring-emerald-700/30'
              : 'bg-red-600 text-white ring-red-700/30'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span className="flex-1">{toast.text}</span>
        </div>
      ))}
    </div>
  )
}
