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

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RestTimerState | null>(null)
  // Drives the visible countdown — re-renders every ~250ms while a timer is active.
  const [now, setNow] = useState(() => Date.now())
  // We only fire the "done" sound/haptic once per timer instance.
  const firedFor = useRef<number | null>(null)

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

  const start = useCallback((seconds: number, label: string | null = null) => {
    if (!seconds || seconds <= 0) return
    firedFor.current = null
    setState({
      deadline: Date.now() + seconds * 1000,
      totalSeconds: seconds,
      label,
    })
  }, [])

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
    () => ({ state, start, cancel, addSeconds }),
    [state, start, cancel, addSeconds]
  )

  return (
    <RestTimerContext.Provider value={value}>
      {children}
      <RestTimerBar />
    </RestTimerContext.Provider>
  )
}

/** Sticky bottom bar that displays the active rest countdown. */
function RestTimerBar() {
  const { state, cancel, addSeconds } = useRestTimer()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!state) return
    const handle = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(handle)
  }, [state])

  if (!state) return null

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
      className="fixed left-3 right-3 bottom-3 z-40 sm:left-auto sm:right-4 sm:max-w-sm pointer-events-none"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
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
