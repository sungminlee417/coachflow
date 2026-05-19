'use client'

// Theme provider + hook for app-wide light/dark toggle.
//
// State sources (in order of precedence at runtime):
//   1. User's explicit choice in Settings → persisted to
//      `profiles.theme` (cross-device) AND `localStorage` (fast
//      first-paint).
//   2. OS `prefers-color-scheme` when the user's choice is 'system'.
//
// FOUC avoidance: the inline script in <head> reads localStorage +
// system pref synchronously before React mounts, and stamps the
// `dark` class onto <html>. This component takes over after hydration
// without flipping anything that the script already got right.
//
// Profile sync: when an authenticated user first loads the app, the
// Server Component reads `profiles.theme` and passes it down. We
// reconcile that value into local state on mount — if it differs from
// what the inline script applied (e.g. user changed theme on another
// device), the class flips once and localStorage updates for next time.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { ThemePreference } from '@/lib/types'

/** localStorage key — referenced by both this module and the inline
 *  bootstrap script in `app/layout.tsx`. Keep in sync. */
export const THEME_STORAGE_KEY = 'coachflow-theme'

interface ThemeContextValue {
  /** The user's saved preference: 'system' | 'light' | 'dark'. */
  theme: ThemePreference
  /** What's actually applied right now: 'light' | 'dark'. Resolves
   *  'system' against the live OS preference. */
  resolved: 'light' | 'dark'
  /** Update the preference. Updates local state, localStorage, and
   *  the <html> class. Remote persistence (writing to `profiles.theme`)
   *  is the caller's responsibility — Settings does this through the
   *  existing `useUpdateProfile` hook so optimistic updates + error
   *  rollback come for free. */
  setTheme: (next: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readStoredPref(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage may throw in private-browsing / disabled-storage modes.
    // Falling back to 'system' is the right default.
  }
  return 'system'
}

function applyClass(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

/** Resolve a stored preference against the live OS preference. */
function resolvePref(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system' ? readSystemPref() : pref
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start from localStorage to match what the inline bootstrap script
  // already applied. Without this, SSR'd HTML would say 'system' →
  // 'light' and the first client render would briefly look light even
  // if the bootstrap script went dark.
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    readStoredPref()
  )
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolvePref(readStoredPref())
  )

  // Track OS preference changes while in 'system' mode.
  useEffect(() => {
    if (theme !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const next = e.matches ? 'dark' : 'light'
      setResolved(next)
      applyClass(next)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [theme])

  // Cross-tab sync. `storage` events fire in every *other* tab when the
  // key is written, so changing the theme in one tab propagates to all
  // other open tabs of the app on the same origin.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return
      const next =
        e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'system'
          ? e.newValue
          : 'system'
      setThemeState(next)
      const r = resolvePref(next)
      setResolved(r)
      applyClass(r)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Ignore storage failures; theme still applies in-memory.
    }
    const r = resolvePref(next)
    setResolved(r)
    applyClass(r)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/** Read the active theme + change it. Safe to call outside a provider
 *  (returns inert defaults) so error boundaries / unmounted-tree code
 *  doesn't throw. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return {
      theme: 'system',
      resolved: 'light',
      setTheme: () => {},
    }
  }
  return ctx
}

/** Reconcile the in-memory theme with a freshly fetched profile row.
 *  Mounted inside the authenticated dashboard so a theme set on
 *  another device propagates back to this one on next load. No-ops
 *  when the profile value matches what we already have. */
export function ProfileThemeSync({
  profileTheme,
}: {
  profileTheme: ThemePreference | undefined
}) {
  const { theme, setTheme } = useTheme()
  useEffect(() => {
    if (!profileTheme) return
    if (profileTheme === theme) return
    setTheme(profileTheme)
    // We only want to run this when the *profile* value changes —
    // local edits already update `theme` via setTheme and shouldn't
    // re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTheme])
  return null
}
