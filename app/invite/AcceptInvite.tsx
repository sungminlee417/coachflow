'use client'

import Link from 'next/link'
import { CheckCircle, XCircle, Dumbbell } from 'lucide-react'

interface AcceptInviteProps {
  status: 'success' | 'error'
  message: string
}

export default function AcceptInvite({ status, message }: AcceptInviteProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-elevated">
      <div className="max-w-sm w-full mx-4 text-center">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Dumbbell size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">CoachFlow</span>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-line shadow-sm p-8">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
 status === 'success' ? 'bg-emerald-soft ' : 'bg-red-soft '
 }`}>
            {status === 'success' ? (
              <CheckCircle size={28} className="text-emerald-fg" />
            ) : (
              <XCircle size={28} className="text-red-fg" />
            )}
          </div>

          <h2 className="text-xl font-bold text-foreground mb-2">
            {status === 'success' ? 'Invite Accepted' : 'Invite Failed'}
          </h2>
          <p className="text-muted text-sm mb-6">{message}</p>

          <Link
            href="/app"
            className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
