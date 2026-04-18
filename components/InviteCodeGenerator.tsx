'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from './Toast'
import { Plus, Copy, Link as LinkIcon } from 'lucide-react'

interface InviteCode {
  id: string
  code: string
  status: string
  max_uses: number
  times_used: number
  expires_at: string | null
  created_at: string
}

interface InviteCodeGeneratorProps {
  coachId: string
}

export default function InviteCodeGenerator({ coachId }: InviteCodeGeneratorProps) {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchInviteCodes()
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

  const generateInviteCode = async () => {
    setGenerating(true)
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()

      const { error } = await supabase
        .from('invite_codes')
        .insert({
          coach_id: coachId,
          code: code,
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

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/invite?code=${code}`
    navigator.clipboard.writeText(link)
    showToast('Invite link copied to clipboard!')
  }

  if (loading) {
    return <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Invite Codes</h2>
          <p className="text-sm text-slate-500 mt-1">Generate invite codes to connect with new clients</p>
        </div>
        <button
          onClick={generateInviteCode}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors cursor-pointer"
        >
          <Plus size={16} />
          {generating ? 'Generating...' : 'Generate Code'}
        </button>
      </div>

      {inviteCodes.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <LinkIcon size={20} className="text-slate-400" />
          </div>
          <p className="text-slate-500 mb-1">No invite codes yet</p>
          <p className="text-sm text-slate-400">Generate one to invite your first client</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inviteCodes.map((invite) => (
            <div key={invite.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <code className="text-sm font-mono bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700">
                  {invite.code}
                </code>
                <span
                  className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                    invite.status === 'pending'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : invite.status === 'accepted'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border border-slate-200'
                  }`}
                >
                  {invite.status}
                </span>
                <span className="text-sm text-slate-400">
                  {invite.times_used}/{invite.max_uses} used
                </span>
                <span className="text-sm text-slate-400">
                  {new Date(invite.created_at).toLocaleDateString()}
                </span>
              </div>
              {invite.status === 'pending' && invite.times_used < invite.max_uses && (
                <button
                  onClick={() => copyInviteLink(invite.code)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer font-medium"
                >
                  <Copy size={14} />
                  Copy Link
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
