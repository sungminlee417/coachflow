'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

interface ToastMessage {
  id: number
  text: string
  type: 'success' | 'error'
}

let toastId = 0
let addToastFn: ((text: string, type: 'success' | 'error') => void) | null = null

export function showToast(text: string, type: 'success' | 'error' = 'success') {
  addToastFn?.(text, type)
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((text: string, type: 'success' | 'error') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    addToastFn = addToast
    return () => { addToastFn = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{ animation: 'slideUp 0.2s ease-out' }}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.text}
        </div>
      ))}
    </div>
  )
}
