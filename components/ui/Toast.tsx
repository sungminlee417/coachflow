'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { subscribeModalStack, getOpenModalCount } from '@/lib/modal-stack'

type ToastType = 'success' | 'error'

interface ToastMessage {
  id: number
  text: string
  type: ToastType
}

const TOAST_LIFETIME_MS = 3000

let toastId = 0
let addToastFn: ((text: string, type: ToastType) => void) | null = null

export function showToast(text: string, type: ToastType = 'success') {
  addToastFn?.(text, type)
}

export default function ToastContainer() {
  // One slot, latest-wins. Actions in this app are sequential, so stacking
  // toasts mostly just clutters the screen — a new message supersedes the
  // old. If an identical message is already showing we keep it (and reset
  // the timer so the user has the full visibility window from the latest
  // trigger).
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const modalCount = useSyncExternalStore(
    subscribeModalStack,
    getOpenModalCount,
    () => 0
  )
  const modalOpen = modalCount > 0

  const scheduleDismiss = useCallback((id: number) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev))
    }, TOAST_LIFETIME_MS)
  }, [])

  const addToast = useCallback(
    (text: string, type: ToastType) => {
      setToast(prev => {
        // Same message already on screen: keep the existing row, just reset
        // its dismissal timer so we don't undercut the visibility window.
        if (prev && prev.text === text && prev.type === type) {
          scheduleDismiss(prev.id)
          return prev
        }
        const id = ++toastId
        scheduleDismiss(id)
        return { id, text, type }
      })
    },
    [scheduleDismiss]
  )

  useEffect(() => {
    addToastFn = addToast
    return () => {
      addToastFn = null
    }
  }, [addToast])

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [])

  if (!toast) return null

  // When a modal is open, the bottom of the screen is taken by the
  // mobile-sheet dialog — relocate to the top so the user can still see the
  // success/error message. On sm+ the modal is centered and the toast
  // already lives in the bottom-right, so this only matters on phones.
  const positionCls = modalOpen
    ? 'top-[calc(env(safe-area-inset-top)+1rem)] left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm sm:top-4'
    : 'bottom-[calc(env(safe-area-inset-bottom)+4rem)] left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm sm:bottom-4'

  return (
    <div
      className={`fixed ${positionCls} z-60 pointer-events-none`}
      role="status"
      aria-live="polite"
    >
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
    </div>
  )
}
