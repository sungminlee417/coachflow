'use client'

// Two sections:
//   • Account — auth-level changes (password, email shown read-only).
//   • Preferences — per-user UI toggles persisted on `profiles`.
//
// Preferences toggle through `useUpdateProfile`'s optimistic patch, so
// flipping them updates the cache instantly and propagates to consumers
// (RestTimer, StreakCard) on the next render — no refetch flicker.

import { useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Settings as SettingsIcon, KeyRound, ToggleRight } from 'lucide-react'
import { useProfile, useUpdateProfile } from '@/lib/hooks/use-profile'

interface SettingsViewProps {
  userId: string
  email: string
}

export default function SettingsView({ userId, email }: SettingsViewProps) {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
          <SettingsIcon size={18} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
          <p className="text-sm text-slate-500">
            Your account and how the app behaves.
          </p>
        </div>
      </header>

      <PreferencesSection userId={userId} />
      <AccountSection email={email} />
    </div>
  )
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof KeyRound
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-9 w-9 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

// ── Preferences ─────────────────────────────────────────────────────────

function PreferencesSection({ userId }: { userId: string }) {
  const profile = useProfile(userId)
  const update = useUpdateProfile(userId)

  // Defaults match the column defaults (TRUE) so the toggle UI never
  // flickers from "off" to "on" while the profile finishes loading.
  const restTimerEnabled = profile.data?.rest_timer_enabled !== false
  const showStreakCard = profile.data?.show_streak_card !== false

  const flip = (key: 'rest_timer_enabled' | 'show_streak_card', next: boolean) => {
    update.mutate(
      { [key]: next },
      { onError: () => showToast('Failed to save preference', 'error') }
    )
  }

  return (
    <SectionCard
      icon={ToggleRight}
      title="Preferences"
      description="Hide things you don't use."
    >
      <div className="divide-y divide-slate-100 -my-2">
        <ToggleRow
          label="Rest timer"
          description="Show a countdown after marking a set complete."
          checked={restTimerEnabled}
          onChange={v => flip('rest_timer_enabled', v)}
          disabled={!profile.isSuccess}
        />
        <ToggleRow
          label="Streak card"
          description="Show the consecutive-days counter on the Today dashboard."
          checked={showStreakCard}
          onChange={v => flip('show_streak_card', v)}
          disabled={!profile.isSuccess}
        />
      </div>
    </SectionCard>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center gap-3 py-3 cursor-pointer ${
        disabled ? 'opacity-60 cursor-default' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        } ${disabled ? 'cursor-default' : ''}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  )
}

// ── Account ─────────────────────────────────────────────────────────────

function AccountSection({ email }: { email: string }) {
  return (
    <SectionCard
      icon={KeyRound}
      title="Account"
      description="Sign-in details for this device and all others."
    >
      <div className="space-y-5">
        <Field id="account-email" label="Email">
          <Input id="account-email" value={email} disabled />
        </Field>
        <ChangePasswordForm />
      </div>
    </SectionCard>
  )
}

function ChangePasswordForm() {
  const supabase = useSupabase()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) {
      showToast('Password must be at least 8 characters', 'error')
      return
    }
    if (next !== confirm) {
      showToast('Passwords don’t match', 'error')
      return
    }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: next })
    setSaving(false)
    if (error) {
      showToast(error.message || 'Failed to update password', 'error')
      return
    }
    setNext('')
    setConfirm('')
    showToast('Password updated')
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field id="account-new-password" label="New password">
        <Input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={e => setNext(e.target.value)}
          placeholder="At least 8 characters"
        />
      </Field>
      <Field id="account-confirm-password" label="Confirm new password">
        <Input
          id="account-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
      </Field>
      <div className="flex justify-end">
        <Button
          type="submit"
          loading={saving}
          disabled={saving || !next || !confirm}
        >
          {saving ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </form>
  )
}
