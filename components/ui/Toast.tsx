'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { subscribeModalStack, getOpenModalCount } from '@/lib/modal-stack'

type ToastType = 'success' | 'error'

interface ToastMessage {
  id: number
  text: string
  type: ToastType
}

let toastId = 0
let addToastFn: ((text: string, type: ToastType) => void) | null = null

// Dedupe identical toasts fired within this window — prevents the same error
// stacking when a flaky save retries or two callers race to surface the same
// message. Resolution is small enough that a single intentional double-tap of
// "Saved" still queues both.
const DEDUPE_WINDOW_MS = 1500
let lastShown: { text: string; type: ToastType; at: number } | null = null

export function showToast(text: string, type: ToastType = 'success') {
  const now = Date.now()
  if (
    lastShown &&
    lastShown.text === text &&
    lastShown.type === type &&
    now - lastShown.at < DEDUPE_WINDOW_MS
  ) {
    return
  }
  lastShown = { text, type, at: now }
  addToastFn?.(text, type)
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const modalCount = useSyncExternalStore(
    subscribeModalStack,
    getOpenModalCount,
    () => 0
  )
  const modalOpen = modalCount > 0

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

  // When a modal is open, the bottom of the screen is taken by the
  // mobile-sheet dialog — relocate to the top so the user can still see the
  // success/error message. On sm+ the modal is centered and the toast
  // already lives in the bottom-right, so this only matters on phones.
  const positionCls = modalOpen
    ? 'top-[calc(env(safe-area-inset-top)+1rem)] left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm sm:top-4'
    : 'bottom-[calc(env(safe-area-inset-bottom)+4rem)] left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm sm:bottom-4'

  return (
    <div
      className={`fixed ${positionCls} z-60 flex flex-col gap-2 pointer-events-none`}
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
