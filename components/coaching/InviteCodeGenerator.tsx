'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { InviteCodeListSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Plus, Copy, Link as LinkIcon, Trash2 } from 'lucide-react'
import { generateInviteCode, formatDate } from '@/lib/utils'
import type { InviteCode } from '@/lib/types'

interface InviteCodeGeneratorProps {
  coachId: string
}

type UsesOption = 1 | 5 | 0 // 0 = unlimited
type ExpiryOption = 1 | 7 | 30 | 0 // days; 0 = never

const USES_OPTIONS: { value: UsesOption; label: string; sublabel: string }[] = [
  { value: 1, label: '1', sublabel: 'Single use' },
  { value: 5, label: '5', sublabel: 'Small group' },
  { value: 0, label: '∞', sublabel: 'Unlimited' },
]

const EXPIRY_OPTIONS: { value: ExpiryOption; label: string }[] = [
  { value: 1, label: '24 hours' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 0, label: 'Never' },
]

// Quick "in 3 days" / "expired" stamp for the row metadata. Keep it inline
// rather than dragging in a date library for two strings.
function formatExpiry(expiresAt: string | null): { text: string; tone: 'normal' | 'soon' | 'expired' } {
  if (!expiresAt) return { text: 'No expiry', tone: 'normal' }
  const now = Date.now()
  const target = new Date(expiresAt).getTime()
  const diffMs = target - now
  if (diffMs <= 0) return { text: 'Expired', tone: 'expired' }
  const diffHours = diffMs / 3_600_000
  if (diffHours < 24) {
    const h = Math.max(1, Math.round(diffHours))
    return { text: `Expires in ${h}h`, tone: 'soon' }
  }
  const days = Math.round(diffHours / 24)
  return { text: `Expires in ${days}d`, tone: days <= 3 ? 'soon' : 'normal' }
}

// `max_uses = 0` is our convention for "unlimited" — the accept flow uses
// `times_used >= max_uses` which is never true when max_uses is 0… except
// 0 itself. We bump unlimited codes to a high number so the existing check
// keeps working without a server-side migration.
const UNLIMITED_USES = 999_999

export default function InviteCodeGenerator({ coachId }: InviteCodeGeneratorProps) {
  const supabase = useSupabase()
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [usesChoice, setUsesChoice] = useState<UsesOption>(1)
  const [expiryChoice, setExpiryChoice] = useState<ExpiryOption>(30)
  const [pendingDelete, setPendingDelete] = useState<InviteCode | null>(null)
  const [showRevoked, setShowRevoked] = useState(false)

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

  // Default view hides revoked codes — they clutter the list and the coach
  // already decided they're done with those.
  const visibleCodes = useMemo(
    () => (showRevoked ? inviteCodes : inviteCodes.filter(c => !c.revoked_at)),
    [inviteCodes, showRevoked]
  )
  const revokedCount = inviteCodes.length - inviteCodes.filter(c => !c.revoked_at).length

  const openGenerateModal = () => {
    setUsesChoice(1)
    setExpiryChoice(30)
    setShowGenerateModal(true)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const maxUses = usesChoice === 0 ? UNLIMITED_USES : usesChoice
      const expiresAt =
        expiryChoice === 0
          ? null
          : new Date(Date.now() + expiryChoice * 24 * 3_600_000).toISOString()
      const { error } = await supabase.from('invite_codes').insert({
        coach_id: coachId,
        code: generateInviteCode(),
        max_uses: maxUses,
        expires_at: expiresAt,
        status: 'pending',
      })
      if (error) throw error
      setShowGenerateModal(false)
      await fetchInviteCodes()
      showToast('Invite code generated')
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

  // Unused codes hard-delete cleanly. Used codes have to soft-revoke because
  // `coach_client_relationships.invite_code_id` references them — see CLAUDE.md
  // on never delete-and-reinsert rows with client-owned children.
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    const code = pendingDelete
    const isUsed = code.times_used > 0
    try {
      if (isUsed) {
        const { error } = await supabase
          .from('invite_codes')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', code.id)
        if (error) throw error
        showToast('Invite code revoked')
      } else {
        const { error } = await supabase.from('invite_codes').delete().eq('id', code.id)
        if (error) throw error
        showToast('Invite code deleted')
      }
      setPendingDelete(null)
      await fetchInviteCodes()
    } catch {
      showToast(isUsed ? 'Failed to revoke code' : 'Failed to delete code', 'error')
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Invite Codes</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Loading invite codes…</p>
          </div>
        </div>
        <InviteCodeListSkeleton count={3} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Invite Codes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Generate invite codes to connect with new clients</p>
        </div>
        <Button onClick={openGenerateModal} className="w-full sm:w-auto">
          <Plus size={16} />
          Generate Code
        </Button>
      </div>

      {inviteCodes.length === 0 ? (
        <EmptyState
          icon={LinkIcon}
          title="No invite codes yet"
          description="Generate one to invite your first client"
          action={
            <Button onClick={openGenerateModal}>
              <Plus size={16} />
              Generate Your First Code
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {visibleCodes.map(invite => {
              const expiry = formatExpiry(invite.expires_at)
              const isRevoked = !!invite.revoked_at
              const isExpired = expiry.tone === 'expired'
              const isUsedUp =
                invite.times_used >= invite.max_uses && invite.max_uses < UNLIMITED_USES
              const isUnlimited = invite.max_uses >= UNLIMITED_USES
              const isUsable = !isRevoked && !isExpired && !isUsedUp

              const statusBadge = isRevoked
                ? { label: 'Revoked', cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' }
                : isExpired
                  ? { label: 'Expired', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800' }
                  : isUsedUp
                    ? { label: 'Used up', cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' }
                    : { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800' }

              const expiryTone =
                expiry.tone === 'expired'
                  ? 'text-amber-600'
                  : expiry.tone === 'soon'
                    ? 'text-amber-600'
                    : 'text-slate-400'

              return (
                <div
                  key={invite.id}
                  className={`bg-white dark:bg-slate-900 rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                    isRevoked ? 'border-slate-200 dark:border-slate-700 opacity-60' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
                    <code className={`text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg ${isRevoked ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
                      {invite.code}
                    </code>
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${statusBadge.cls}`}>
                      {statusBadge.label}
                    </span>
                    <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">
                      {isUnlimited
                        ? `${invite.times_used} used`
                        : `${invite.times_used}/${invite.max_uses} used`}
                    </span>
                    {!isRevoked && (
                      <span className={`text-xs sm:text-sm ${expiryTone}`}>
                        {expiry.text}
                      </span>
                    )}
                    <span className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">
                      Created {formatDate(invite.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isUsable && (
                      <button
                        onClick={() => handleCopy(invite.code)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors cursor-pointer font-medium border border-indigo-100 dark:border-indigo-900 sm:border-transparent flex-1 sm:flex-initial"
                      >
                        <Copy size={14} />
                        Copy Link
                      </button>
                    )}
                    {!isRevoked && (
                      <IconButton
                        tone="danger"
                        onClick={() => setPendingDelete(invite)}
                        aria-label={invite.times_used > 0 ? 'Revoke invite code' : 'Delete invite code'}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {revokedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowRevoked(s => !s)}
              className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
            >
              {showRevoked
                ? `Hide revoked (${revokedCount})`
                : `Show revoked (${revokedCount})`}
            </button>
          )}
        </>
      )}

      <Modal
        open={showGenerateModal}
        title="Generate invite code"
        onClose={() => !generating && setShowGenerateModal(false)}
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Number of uses
            </label>
            <div className="grid grid-cols-3 gap-2">
              {USES_OPTIONS.map(opt => {
                const selected = opt.value === usesChoice
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUsesChoice(opt.value)}
                    className={`rounded-xl border p-3 text-center transition-colors cursor-pointer ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`text-xl font-bold ${selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-slate-100'}`}>
                      {opt.label}
                    </div>
                    <div className={`text-[11px] ${selected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {opt.sublabel}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Expires in
            </label>
            <div className="grid grid-cols-2 gap-2">
              {EXPIRY_OPTIONS.map(opt => {
                const selected = opt.value === expiryChoice
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setExpiryChoice(opt.value)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              Tip: short-lived codes are safer if you&apos;re posting the link anywhere public.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-5 mt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={() => setShowGenerateModal(false)}
            disabled={generating}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} loading={generating}>
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete && pendingDelete.times_used > 0 ? 'Revoke invite code?' : 'Delete invite code?'}
        message={
          pendingDelete && pendingDelete.times_used > 0
            ? 'This code has already been used. We\'ll keep it on record but disable any further sign-ups.'
            : 'This invite code will be removed. Anyone with the link will see an error.'
        }
        confirmLabel={pendingDelete && pendingDelete.times_used > 0 ? 'Revoke' : 'Delete'}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
