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
import {
  Settings as SettingsIcon,
  KeyRound,
  ToggleRight,
  Monitor,
  Moon,
  Sun,
  Palette,
} from 'lucide-react'
import { useProfile, useUpdateProfile } from '@/lib/hooks/use-profile'
import { useTheme } from '@/lib/theme'
import type { ThemePreference } from '@/lib/types'

interface SettingsViewProps {
  userId: string
  email: string
}

export default function SettingsView({ userId, email }: SettingsViewProps) {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
          <SettingsIcon size={18} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your account and how the app behaves.
          </p>
        </div>
      </header>

      <AppearanceSection userId={userId} />
      <PreferencesSection userId={userId} />
      <AccountSection email={email} />
    </div>
  )
}

// ── Appearance ──────────────────────────────────────────────────────────

function AppearanceSection({ userId }: { userId: string }) {
  const { theme, setTheme } = useTheme()
  const update = useUpdateProfile(userId)

  const choose = (next: ThemePreference) => {
    // Local first — the <html> class flips immediately so the UI reacts
    // before the network round-trip. The mutation patches the profile
    // cache optimistically; on error it rolls back the cache, but we
    // intentionally don't revert the visual theme — the user explicitly
    // picked it, and a transient sync failure shouldn't undo their UX
    // choice on this device. Next reload of an unsynced device will
    // pull the canonical value from the profile.
    setTheme(next)
    update.mutate(
      { theme: next },
      { onError: () => showToast('Theme saved on this device only', 'error') }
    )
  }

  const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ]

  return (
    <SectionCard
      icon={Palette}
      title="Appearance"
      description="Light, dark, or follow your device."
    >
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-3 gap-2"
      >
        {options.map(opt => {
          const Icon = opt.icon
          const active = theme === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(opt.value)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-200'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon size={18} />
              {opt.label}
            </button>
          )
        })}
      </div>
    </SectionCard>
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
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
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
      <div className="divide-y divide-slate-100 dark:divide-slate-800 -my-2">
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
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
        } ${disabled ? 'cursor-default' : ''}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-slate-900 shadow transition-transform ${
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
