'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Plus, Copy, Link as LinkIcon } from 'lucide-react'
import { generateInviteCode, formatDate } from '@/lib/utils'
import type { InviteCode } from '@/lib/types'

interface InviteCodeGeneratorProps {
  coachId: string
}

export default function InviteCodeGenerator({ coachId }: InviteCodeGeneratorProps) {
  const supabase = useSupabase()
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchInviteCodes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchInviteCodes = async () => {
    try {
      const { data, error } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setInviteCodes(data || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { error } = await supabase.from('invite_codes').insert({
        coach_id: coachId,
        code: generateInviteCode(),
        max_uses: 1,
        status: 'pending',
      })
      if (error) throw error
      await fetchInviteCodes()
    } catch {
      showToast('Failed to generate invite code', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = (code: string) => {
    const link = `${window.location.origin}/invite?code=${code}`
    navigator.clipboard.writeText(link)
    showToast('Invite link copied to clipboard!')
  }

  const statusStyles: Record<string, string> = {
    pending: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accepted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  }

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Invite Codes</h2>
          <p className="text-sm text-slate-500 mt-1">Generate invite codes to connect with new clients</p>
        </div>
        <Button onClick={handleGenerate} disabled={generating}>
          <Plus size={16} />
          {generating ? 'Generating...' : 'Generate Code'}
        </Button>
      </div>

      {inviteCodes.length === 0 ? (
        <EmptyState
          icon={LinkIcon}
          title="No invite codes yet"
          description="Generate one to invite your first client"
        />
      ) : (
        <div className="space-y-3">
          {inviteCodes.map(invite => {
            const isUsable = invite.status === 'pending' && invite.times_used < invite.max_uses
            const statusCls = statusStyles[invite.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'
            return (
              <div
                key={invite.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <code className="text-sm font-mono bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700">
                    {invite.code}
                  </code>
                  <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusCls}`}>
                    {invite.status}
                  </span>
                  <span className="text-sm text-slate-400">
                    {invite.times_used}/{invite.max_uses} used
                  </span>
                  <span className="text-sm text-slate-400">{formatDate(invite.created_at)}</span>
                </div>
                {isUsable && (
                  <button
                    onClick={() => handleCopy(invite.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer font-medium"
                  >
                    <Copy size={14} />
                    Copy Link
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
