'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { pushModal, popModal } from '@/lib/modal-stack'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  // Stash the latest onClose in a ref so the escape-key effect only depends
  // on `open` — callers that pass an inline arrow (most of them) would
  // otherwise re-add/remove the keydown listener on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Tell the toast layer to relocate while a modal is on screen so a fresh
  // toast doesn't appear under the mobile bottom sheet.
  useEffect(() => {
    if (!open) return
    pushModal()
    return () => popModal()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-2 sm:p-4"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
      onClick={onClose}
    >
      <div
        // `dvh` (dynamic viewport height) accounts for the mobile address
        // bar / keyboard collapsing so the modal stays usable. On phones the
        // dialog rises from the bottom; on sm+ it floats centered.
        className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[92dvh] flex flex-col"
        style={{ animation: 'scaleIn 0.18s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <IconButton onClick={onClose} aria-label="Close">
            <X size={18} />
          </IconButton>
        </div>
        {/* `pt-1` gives the body's overflow box a sliver of room above
            its first child so a focused input's 2px outset focus ring
            isn't clipped at the top by the scroll container. The
            horizontal `px-5` is already much wider than the 2px ring,
            so left/right edges are safe without extra padding. */}
        <div className="overflow-y-auto px-5 sm:px-6 pt-1 pb-5 sm:pb-6 flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
