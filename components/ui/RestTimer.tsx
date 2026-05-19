'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Timer, X, Plus } from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { useProfile } from '@/lib/hooks/use-profile'

interface RestTimerState {
  // Wall-clock time the timer should fire at (ms since epoch). Using an
  // absolute deadline keeps the countdown accurate even if the tab throttles
  // or the device sleeps.
  deadline: number
  totalSeconds: number
  label: string | null
}

interface RestTimerContextValue {
  state: RestTimerState | null
  /** Start (or restart) a rest timer. Replaces any active timer. */
  start: (seconds: number, label?: string | null) => void
  cancel: () => void
  /** Add seconds onto the current deadline (for the "+30s" button). */
  addSeconds: (delta: number) => void
  /** Per-user preference from profiles.rest_timer_enabled. When false
   *  the idle launcher hides AND any `start()` call short-circuits. */
  enabled: boolean
}

const RestTimerContext = createContext<RestTimerContextValue | null>(null)

export function useRestTimer(): RestTimerContextValue {
  const ctx = useContext(RestTimerContext)
  if (!ctx) {
    // Falls back to a no-op so loggers used outside the provider don't crash.
    return {
      state: null,
      start: () => {},
      cancel: () => {},
      addSeconds: () => {},
      enabled: true,
    }
  }
  return ctx
}

// Tiny audible chirp when the timer ends. Synthesized via Web Audio so we
// don't ship an mp3 with the bundle. Wrapped in try/catch because some
// browsers gate AudioContext behind user gesture / autoplay rules — the
// timer was started by a user click so we should be allowed.
function playDoneSound() {
  try {
    type WindowWithWebkit = typeof window & {
      webkitAudioContext?: typeof AudioContext
    }
    const w = window as WindowWithWebkit
    const Ctx = window.AudioContext || w.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    // Two short beeps a half-second apart.
    osc.frequency.setValueAtTime(880, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    osc.frequency.setValueAtTime(1175, now + 0.25)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.27)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    osc.start(now)
    osc.stop(now + 0.5)
  } catch {
    // Audio is best-effort — silently fail.
  }
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // Silently ignore — vibration is a nice-to-have.
  }
}

export function RestTimerProvider({
  children,
  userId,
}: {
  children: ReactNode
  /** Trainee whose preference flag gates whether the timer can fire.
   *  Optional so non-app surfaces (e.g. tests) can render the provider
   *  without a profile fetch — falls back to "enabled". */
  userId?: string
}) {
  const [state, setState] = useState<RestTimerState | null>(null)
  // Drives the visible countdown — re-renders every ~250ms while a timer is active.
  const [now, setNow] = useState(() => Date.now())
  // We only fire the "done" sound/haptic once per timer instance.
  const firedFor = useRef<number | null>(null)
  // Read the user's preference once; missing/loading profile defaults to
  // enabled so a brief fetch delay never accidentally suppresses a timer.
  // The hook is no-op when `userId` is falsy.
  const profileQuery = useProfile(userId ?? '')
  const restTimerEnabled = profileQuery.data?.rest_timer_enabled !== false

  // Tick loop: only run while a timer is active.
  useEffect(() => {
    if (!state) return
    const handle = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(handle)
  }, [state])

  // Detect crossing the deadline → fire effects + clear the timer.
  useEffect(() => {
    if (!state) return
    if (now < state.deadline) return
    if (firedFor.current === state.deadline) return
    firedFor.current = state.deadline
    playDoneSound()
    vibrate([60, 80, 60])
    // Leave the bar visible briefly so the user sees the "Done!" state, then
    // dismiss. Clearing inline keeps the effect simple.
    const dismiss = window.setTimeout(() => {
      setState(prev => (prev?.deadline === firedFor.current ? null : prev))
    }, 1500)
    return () => window.clearTimeout(dismiss)
  }, [now, state])

  const start = useCallback(
    (seconds: number, label: string | null = null) => {
      if (!seconds || seconds <= 0) return
      // Respect the per-user preference — when off, every `start` is a
      // no-op so callers don't have to thread the check at each callsite.
      if (!restTimerEnabled) return
      firedFor.current = null
      setState({
        deadline: Date.now() + seconds * 1000,
        totalSeconds: seconds,
        label,
      })
    },
    [restTimerEnabled]
  )

  const cancel = useCallback(() => {
    firedFor.current = null
    setState(null)
  }, [])

  const addSeconds = useCallback((delta: number) => {
    setState(prev => {
      if (!prev) return prev
      firedFor.current = null
      return {
        ...prev,
        deadline: prev.deadline + delta * 1000,
        totalSeconds: prev.totalSeconds + delta,
      }
    })
  }, [])

  const value = useMemo<RestTimerContextValue>(
    () => ({ state, start, cancel, addSeconds, enabled: restTimerEnabled }),
    [state, start, cancel, addSeconds, restTimerEnabled]
  )

  return (
    <RestTimerContext.Provider value={value}>
      {children}
      <RestTimerBar />
    </RestTimerContext.Provider>
  )
}

// Quick-start preset durations the user can tap to kick off a rest
// without waiting on the auto-trigger from set completion. Kept short so
// the idle pill stays small.
const REST_PRESETS = [30, 60, 90, 120] as const

function formatPresetLabel(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

/** Sticky bottom bar that displays the active rest countdown — or a
 *  small "start rest" launcher when idle. The auto-trigger from set
 *  completion still works; this just gives the trainee a manual option
 *  for the rest between exercises / circuits / anywhere set-logging
 *  isn't the trigger. */
function RestTimerBar() {
  const { state, cancel, addSeconds, start, enabled } = useRestTimer()
  const [now, setNow] = useState(() => Date.now())
  // Idle launcher is dismissible per-tab so users who never need a
  // manual rest don't keep seeing the pill. The active countdown bar
  // always renders regardless.
  const [launcherDismissed, setLauncherDismissed] = useState(false)

  useEffect(() => {
    if (!state) return
    const handle = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(handle)
  }, [state])

  // Hard kill the whole bar when the user has turned the rest timer
  // off in Settings → Preferences. Covers both the idle launcher and
  // any in-flight countdown (which couldn't have started anyway, but
  // belt + suspenders).
  if (!enabled) return null

  // Idle: render the compact launcher with quick-start preset chips
  // unless the user dismissed it for this session.
  if (!state) {
    if (launcherDismissed) return null
    return (
      <div
        className="fixed left-3 right-3 z-40 bottom-[calc(env(safe-area-inset-bottom)+4rem)] sm:left-auto sm:right-4 sm:max-w-sm sm:bottom-4 pointer-events-none"
        aria-label="Rest timer launcher"
      >
        <div className="pointer-events-auto rounded-2xl shadow-lg border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-2">
          <Timer size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
            Rest
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {REST_PRESETS.map(sec => (
              <button
                key={sec}
                type="button"
                onClick={() => start(sec)}
                className="text-xs font-semibold tabular-nums px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {formatPresetLabel(sec)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLauncherDismissed(true)}
            aria-label="Hide rest timer launcher"
            className="ml-auto h-6 w-6 flex items-center justify-center rounded-md text-slate-300 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  const remainingMs = Math.max(0, state.deadline - now)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const fractionRemaining = Math.max(
    0,
    Math.min(1, remainingMs / (state.totalSeconds * 1000))
  )
  const isDone = remainingMs <= 0

  return (
    <div
      role="status"
      aria-live="polite"
      // Sits above any sticky save bar (z-30 there, z-40 here). Bottom safe-area
      // padding mirrors the save bar so it doesn't sit under the home indicator.
      // On mobile, lift above the bottom tab bar (~3.5rem + safe-area).
      // On desktop (sm:) there's no bottom nav, so a 1rem offset is enough.
      className="fixed left-3 right-3 z-40 bottom-[calc(env(safe-area-inset-bottom)+4rem)] sm:left-auto sm:right-4 sm:max-w-sm sm:bottom-4 pointer-events-none"
    >
      <div
        className={`pointer-events-auto rounded-2xl shadow-xl border overflow-hidden transition-colors ${
          isDone
            ? 'bg-emerald-600 border-emerald-700 text-white'
            : 'bg-slate-900 border-slate-700 text-white'
        }`}
      >
        {/* Progress bar across the top of the pill. */}
        <div className="h-1 bg-slate-700/40 relative">
          <div
            className={`h-full transition-all ${isDone ? 'bg-white/80' : 'bg-indigo-400'}`}
            style={{
              width: `${(1 - fractionRemaining) * 100}%`,
              transitionDuration: '250ms',
            }}
          />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Timer size={18} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
              {isDone ? 'Rest done — go!' : 'Rest'}
            </p>
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {isDone ? "Let's go" : formatDuration(remainingSec) || `${remainingSec}s`}
              {state.label && !isDone && (
                <span className="ml-2 text-xs font-normal opacity-70 truncate">
                  · {state.label}
                </span>
              )}
            </p>
          </div>
          {!isDone && (
            <button
              type="button"
              onClick={() => addSeconds(15)}
              className="inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors cursor-pointer shrink-0"
              aria-label="Add 15 seconds"
            >
              <Plus size={12} />
              15s
            </button>
          )}
          <button
            type="button"
            onClick={cancel}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            aria-label={isDone ? 'Dismiss' : 'Skip rest'}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
