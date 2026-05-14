'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ClipboardList,
  Dumbbell,
  Flame,
  Ruler,
  Scale,
  Utensils,
  Check,
  AlertTriangle,
  Clock,
  Users,
  ListChecks,
  Apple,
} from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { cachedFetch, cachedQuery } from '@/lib/cached-query'
import { queuedUpsert } from '@/lib/write-queue'
import { showToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import {
  fetchActiveMealPlanAssignments,
  fetchActiveWorkoutAssignments,
} from '@/lib/queries'
import {
  daysBetween,
  formatDate,
  formatDuration,
  mealDisplayName,
  numberMealsForDay,
  parseDuration,
  roundMacro,
  todayISO,
} from '@/lib/utils'

// `parseLocalISO` isn't exported from utils — small local version that
// parses YYYY-MM-DD at local midnight (avoids the `new Date(s)` UTC
// off-by-one trap).
function parseLocalISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
import type {
  MealPlanAssignment,
  Profile,
  WeightLog,
  WeightUnit,
  WorkoutAssignment,
} from '@/lib/types'

interface TodayDashboardProps {
  user: { id: string; full_name?: string | null }
  profile: Profile
  /** Hop directly into a deep view (Workouts, Meals, Body, Clients). */
  onNavigate: (tab: TodayNavTarget) => void
}

export type TodayNavTarget =
  | 'assigned-workouts'
  | 'assigned-meals'
  | 'measurements'
  | 'history'
  | 'my-clients'
  | 'my-workouts'
  | 'my-programs'
  | 'my-meal-plans'

/**
 * "Today" home dashboard. Surfaces the few things a trainee actually
 * cares about on a typical morning — their workout, their meals, their
 * weight log — as compact cards. Each card is a tap target that deep-
 * links into the corresponding full view. Data is read from the same
 * cached query keys the deep views use, so opening Today after a
 * tab-switch is a cache hit, and a write in either place shows up here
 * on next render.
 */
export default function TodayDashboard({
  user,
  profile,
  onNavigate,
}: TodayDashboardProps) {
  const today = todayISO()
  const firstName = (profile.full_name ?? '').split(' ')[0]?.trim() || ''
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), [])
  const dateLabel = useMemo(
    () =>
      parseLocalISO(today).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [today]
  )

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          {dateLabel}
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </h2>
      </header>

      <WelcomeBanner userId={user.id} onNavigate={onNavigate} />

      <section className="space-y-3">
        <SectionHeader title="Training" />
        <WorkoutCard
          clientId={user.id}
          loggedDate={today}
          onOpen={() => onNavigate('assigned-workouts')}
        />
        <MealsCard
          clientId={user.id}
          loggedDate={today}
          onOpen={() => onNavigate('assigned-meals')}
        />
        <WeightCard
          userId={user.id}
          weightUnit={profile.weight_unit ?? 'lbs'}
          onOpen={() => onNavigate('measurements')}
        />
        <StreakCard
          clientId={user.id}
          onOpen={() => onNavigate('history')}
        />
        <BodyMeasurementCard
          userId={user.id}
          onOpen={() => onNavigate('measurements')}
        />
      </section>

      <CoachSection coachId={user.id} onNavigate={onNavigate} />
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">
      {title}
    </h3>
  )
}

/**
 * Welcome / first-run banner. Visible only when the user appears to have
 * nothing yet — no workouts they own AND no workout assignments to do.
 * Renders below the greeting and steers them at the two most useful
 * starting actions: build a template (self-coach or coach others) or
 * accept an invite code (be coached). Disappears as soon as they have
 * any content; query is cached so reloads after onboarding don't
 * re-fetch.
 */
function WelcomeBanner({
  userId,
  onNavigate,
}: {
  userId: string
  onNavigate: (tab: TodayNavTarget) => void
}) {
  const supabase = useSupabase()
  const [show, setShow] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Fast existence checks — only need to know "is there at least one
      // row?". `limit(1)` keeps the response tiny, `head: true` would
      // require `count:` which is a heavier read on the server.
      const [workoutsRes, assignmentsRes] = await Promise.all([
        cachedQuery<Array<{ id: string }>>(
          `first_run_workouts:${userId}`,
          () =>
            supabase.from('workouts').select('id').eq('coach_id', userId).limit(1)
        ),
        cachedQuery<Array<{ id: string }>>(
          `first_run_assignments:${userId}`,
          () =>
            supabase
              .from('workout_assignments')
              .select('id')
              .eq('client_id', userId)
              .limit(1)
        ),
      ])
      if (cancelled) return
      const hasWorkouts = (workoutsRes.data ?? []).length > 0
      const hasAssignments = (assignmentsRes.data ?? []).length > 0
      setShow(!hasWorkouts && !hasAssignments)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  if (!show) return null

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
        Welcome
      </p>
      <h3 className="text-lg font-bold text-slate-900 mt-1">
        Let&rsquo;s get you set up
      </h3>
      <p className="text-sm text-slate-600 mt-1">
        Every CoachFlow account can coach and train. Pick where to start:
      </p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onNavigate('my-workouts')}
          className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-slate-900">
            Build a workout
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Make a template you can assign to yourself or a client.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('my-clients')}
          className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          <p className="text-sm font-semibold text-slate-900">
            Invite a client
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate a code to bring someone you coach onto the app.
          </p>
        </button>
      </div>
    </div>
  )
}

function greetingForHour(h: number) {
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

// ── Workout card ────────────────────────────────────────────────────────

function WorkoutCard({
  clientId,
  loggedDate,
  onOpen,
}: {
  clientId: string
  loggedDate: string
  onOpen: () => void
}) {
  const supabase = useSupabase()
  const [assignments, setAssignments] = useState<WorkoutAssignment[] | null>(null)
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  // Bumping this re-runs the load effect after a successful inline log
  // so the progress bar + "next set" pointer advance to the next set.
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data } = await cachedFetch<WorkoutAssignment[]>(
        // Same cache key as ClientWorkoutView so the data is shared.
        `workout_assignments:${clientId}:${loggedDate}`,
        () => fetchActiveWorkoutAssignments(supabase, clientId, loggedDate)
      )
      if (cancelled) return
      const list = data ?? []
      setAssignments(list)
      // Pull completed set_logs for the day so we can paint a real
      // progress bar. We only need (exercise_id, set_number) pairs that
      // are `completed: true`.
      if (list.length === 0) {
        setCompletedKeys(new Set())
        setLoading(false)
        return
      }
      const assignmentIds = list.map(a => a.id)
      const { data: logs } = await cachedQuery<
        Array<{ exercise_id: string; set_number: number; completed: boolean }>
      >(
        `set_logs_summary:${clientId}:${loggedDate}:${assignmentIds.sort().join(',')}`,
        () =>
          supabase
            .from('set_logs')
            .select('exercise_id, set_number, completed')
            .in('assignment_id', assignmentIds)
            .eq('logged_date', loggedDate)
      )
      if (cancelled) return
      const keys = new Set<string>()
      for (const l of logs ?? []) {
        if (l.completed) keys.add(`${l.exercise_id}::${l.set_number}`)
      }
      setCompletedKeys(keys)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, clientId, loggedDate, refreshTick])

  const summary = useMemo(() => {
    if (!assignments) return null
    let totalSets = 0
    let completedSets = 0
    let nextExercise: string | null = null
    // The "next set you should log". Supersets still need the deep view
    // (multi-exercise round logging), but cardio and strength both have
    // a single-row inline form here — `kind` tells the renderer which.
    let nextSet: {
      kind: 'strength' | 'cardio'
      assignmentId: string
      exerciseId: string
      exerciseName: string
      targetDurationSeconds: number | null
      setNumber: number
      totalSets: number
      targetReps: string
    } | null = null

    for (const a of assignments) {
      const exercises = a.workout.exercises ?? []
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i]
        const prescribed = ex.exercise_sets?.length ?? ex.sets ?? 0
        totalSets += prescribed
        let exDone = 0
        for (let n = 1; n <= prescribed; n++) {
          if (ex.id && completedKeys.has(`${ex.id}::${n}`)) exDone += 1
        }
        completedSets += exDone
        if (!nextExercise && exDone < prescribed) nextExercise = ex.name

        // Pick the first unfinished set on a plain strength exercise.
        // Skip supersets only — those still need the deep view because
        // each round logs multiple exercises at once. Cardio is fine
        // inline: a single duration field per interval is enough.
        const isCardio = ex.exercise_type === 'cardio'
        const isInSuperset = ex.pair_with_next || exercises[i - 1]?.pair_with_next
        if (!nextSet && ex.id && exDone < prescribed && !isInSuperset) {
          // Find the first set_number that isn't done.
          let target = 1
          for (let n = 1; n <= prescribed; n++) {
            if (!completedKeys.has(`${ex.id}::${n}`)) {
              target = n
              break
            }
          }
          const set = ex.exercise_sets?.[target - 1]
          const targetRepsStr = set?.target_reps ?? ex.reps ?? ''
          nextSet = {
            kind: isCardio ? 'cardio' : 'strength',
            assignmentId: a.id,
            exerciseId: ex.id,
            exerciseName: ex.name,
            setNumber: target,
            totalSets: prescribed,
            targetReps: targetRepsStr,
            targetDurationSeconds: set?.target_duration_seconds ?? null,
          }
        }
      }
    }
    return { totalSets, completedSets, nextExercise, nextSet }
  }, [assignments, completedKeys])

  return (
    <Card onClick={onOpen} accent="emerald" icon={Dumbbell} label="Workout">
      {loading ? (
        <CardSkeletonBody lines={2} />
      ) : !assignments || assignments.length === 0 ? (
        <CardEmpty
          icon={Dumbbell}
          title="Rest day"
          description="No workouts scheduled. Tap to assign one or check past sessions."
        />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900 truncate min-w-0">
              {assignments.map(a => a.workout.name).join(' · ')}
            </p>
            <p className="text-xs text-slate-500 shrink-0 tabular-nums">
              {summary?.completedSets ?? 0}/{summary?.totalSets ?? 0} sets
            </p>
          </div>
          {/* Coach note for today, if the coach left one on any of the
              active assignments. We concatenate when there are multiple
              workouts assigned today — rare but possible. */}
          {assignments
            .map(a => a.notes?.trim())
            .filter((n): n is string => !!n)
            .map((note, i) => (
              <p
                key={i}
                className="text-xs text-indigo-700 bg-indigo-50/60 border border-indigo-100 rounded-md px-2 py-1.5 italic"
              >
                <span className="font-semibold not-italic">Coach:</span> {note}
              </p>
            ))}
          <ProgressBar
            value={summary?.completedSets ?? 0}
            total={summary?.totalSets ?? 0}
            tone="emerald"
          />
          {summary?.nextSet ? (
            <NextSetMiniLogger
              // Remount on advance — fresh empty inputs for the new set.
              key={`${summary.nextSet.exerciseId}::${summary.nextSet.setNumber}`}
              kind={summary.nextSet.kind}
              assignmentId={summary.nextSet.assignmentId}
              exerciseId={summary.nextSet.exerciseId}
              exerciseName={summary.nextSet.exerciseName}
              setNumber={summary.nextSet.setNumber}
              totalSets={summary.nextSet.totalSets}
              targetReps={summary.nextSet.targetReps}
              targetDurationSeconds={summary.nextSet.targetDurationSeconds}
              loggedDate={loggedDate}
              onLogged={() => setRefreshTick(t => t + 1)}
            />
          ) : summary?.nextExercise ? (
            // The next thing to do is a cardio exercise or superset
            // round, which the inline mini-logger doesn't handle. Point
            // the user at the full view via the Open button.
            <p className="text-xs text-slate-500 truncate">
              Next:{' '}
              <span className="font-medium text-slate-700">{summary.nextExercise}</span>
              <span className="ml-1 text-slate-400">— open to log</span>
            </p>
          ) : null}
          {summary && summary.totalSets > 0 && summary.completedSets >= summary.totalSets && (
            <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
              <Check size={12} /> Done for the day
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

// Compact "log the next set" form rendered inline in the Workout card.
// Only fires for plain strength exercises — supersets and cardio still
// require the full ClientWorkoutView (open via the corner Open button).
// On a successful upsert, `onLogged()` bumps a refresh tick on the
// parent which re-derives "the next set" and advances the form to it.
function NextSetMiniLogger({
  kind,
  assignmentId,
  exerciseId,
  exerciseName,
  setNumber,
  totalSets,
  targetReps,
  targetDurationSeconds,
  loggedDate,
  onLogged,
}: {
  kind: 'strength' | 'cardio'
  assignmentId: string
  exerciseId: string
  exerciseName: string
  setNumber: number
  totalSets: number
  targetReps: string
  targetDurationSeconds: number | null
  loggedDate: string
  onLogged: () => void
}) {
  const supabase = useSupabase()
  // Inputs are local to *this* set. The parent's refreshTick remounts
  // the form's `key` when we advance, which is enough to reset state —
  // see the `key={...}` on the wrapper in WorkoutCard.
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  // Cardio path uses a single duration field — accepts the same loose
  // formats as the deep cardio logger ("20:30", "30", "1h 20m").
  const [duration, setDuration] = useState('')
  const [saving, setSaving] = useState(false)

  const handleLog = async () => {
    setSaving(true)
    if (kind === 'strength') {
      const w = weight === '' ? null : parseFloat(weight)
      const r = reps === '' ? null : parseFloat(reps)
      if (r == null || !Number.isFinite(r) || r <= 0) {
        showToast('Enter reps to log this set', 'error')
        setSaving(false)
        return
      }
      const { error } = await queuedUpsert(
        supabase,
        'set_logs',
        {
          assignment_id: assignmentId,
          exercise_id: exerciseId,
          set_number: setNumber,
          logged_date: loggedDate,
          reps_performed: r,
          weight_performed: w != null && Number.isFinite(w) ? w : null,
          duration_performed_seconds: null,
          completed: true,
        },
        { onConflict: 'assignment_id,exercise_id,set_number,logged_date' }
      )
      setSaving(false)
      if (error) {
        showToast('Failed to log set', 'error')
        return
      }
      onLogged()
      return
    }
    // Cardio path: persist duration_performed_seconds. Strength columns
    // stay null. Speed / incline / resistance are intentionally not
    // collected here — they live in the deep view's per-machine UI.
    const parsedSeconds = parseDuration(duration)
    if (parsedSeconds == null || parsedSeconds <= 0) {
      showToast('Enter a duration (e.g. 20 or 20:30)', 'error')
      setSaving(false)
      return
    }
    const { error } = await queuedUpsert(
      supabase,
      'set_logs',
      {
        assignment_id: assignmentId,
        exercise_id: exerciseId,
        set_number: setNumber,
        logged_date: loggedDate,
        reps_performed: null,
        weight_performed: null,
        duration_performed_seconds: parsedSeconds,
        completed: true,
      },
      { onConflict: 'assignment_id,exercise_id,set_number,logged_date' }
    )
    setSaving(false)
    if (error) {
      showToast('Failed to log set', 'error')
      return
    }
    onLogged()
  }

  const isCardio = kind === 'cardio'
  const cardioTargetLabel =
    isCardio && targetDurationSeconds != null && targetDurationSeconds > 0
      ? formatDuration(targetDurationSeconds)
      : null

  return (
    <div
      className={`rounded-xl border p-2.5 mt-1 ${
        isCardio
          ? 'bg-amber-50/40 border-amber-100'
          : 'bg-emerald-50/40 border-emerald-100'
      }`}
    >
      <p className="text-[11px] text-slate-600 truncate">
        <span className="font-semibold text-slate-900">{exerciseName}</span>
        <span className="text-slate-400">
          {' · '}
          {isCardio
            ? totalSets > 1
              ? `Interval ${setNumber}/${totalSets}`
              : 'Duration'
            : `Set ${setNumber}/${totalSets}`}
          {!isCardio && targetReps && (
            <>
              {' · '}target{' '}
              <span className="font-medium text-slate-600">{targetReps}</span>
            </>
          )}
          {isCardio && cardioTargetLabel && (
            <>
              {' · '}target{' '}
              <span className="font-medium text-slate-600 tabular-nums">
                {cardioTargetLabel}
              </span>
            </>
          )}
        </span>
      </p>
      <form
        onSubmit={e => {
          // Native `<form>` so Enter on any input fires `handleLog` —
          // common reflex on mobile and desktop both.
          e.preventDefault()
          handleLog()
        }}
        className={`grid gap-2 mt-2 ${
          isCardio
            ? 'grid-cols-[1fr_auto]'
            : 'grid-cols-[1fr_1fr_auto]'
        }`}
      >
        {isCardio ? (
          <Input
            value={duration}
            onChange={e => setDuration(e.target.value)}
            placeholder="20:30 or 30"
            className="text-sm py-1.5"
          />
        ) : (
          <>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="weight"
              className="text-sm py-1.5"
            />
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={reps}
              onChange={e => setReps(e.target.value)}
              placeholder="reps"
              className="text-sm py-1.5"
            />
          </>
        )}
        <Button
          type="submit"
          size="sm"
          loading={saving}
          disabled={saving || !reps}
          aria-label="Log set"
        >
          <Check size={14} />
        </Button>
      </form>
    </div>
  )
}

// ── Meals card ──────────────────────────────────────────────────────────

function MealsCard({
  clientId,
  loggedDate,
  onOpen,
}: {
  clientId: string
  loggedDate: string
  onOpen: () => void
}) {
  const supabase = useSupabase()
  const [assignments, setAssignments] = useState<MealPlanAssignment[] | null>(null)
  const [eaten, setEaten] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  // Per-row assignment id lookup — needed for the `meal_logs` upsert.
  const [assignmentByMealId, setAssignmentByMealId] = useState<Map<string, string>>(
    new Map()
  )
  // Re-tick once a minute so missed-meal status updates as the clock
  // crosses scheduled times. Reading `Date.now()` directly in render is
  // impure (different value each call), but reading it inside a memo
  // keyed on a tick state is fine — the result is stable for the
  // duration of the minute.
  const [minuteTick, setMinuteTick] = useState(0)
  useEffect(() => {
    const handle = window.setInterval(() => setMinuteTick(n => n + 1), 60_000)
    return () => window.clearInterval(handle)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const [{ data: aData }, { data: logsData }] = await Promise.all([
        cachedFetch<MealPlanAssignment[]>(
          `meal_plan_assignments:${clientId}:${loggedDate}`,
          () => fetchActiveMealPlanAssignments(supabase, clientId, loggedDate)
        ),
        cachedQuery<Array<{ meal_id: string; completed: boolean }>>(
          `meal_logs:${clientId}:${loggedDate}`,
          () =>
            supabase
              .from('meal_logs')
              .select('meal_id, completed')
              .eq('user_id', clientId)
              .eq('logged_date', loggedDate)
        ),
      ])
      if (cancelled) return
      const list = aData ?? []
      setAssignments(list)
      const next = new Set<string>()
      for (const r of logsData ?? []) {
        if (r.completed) next.add(r.meal_id)
      }
      setEaten(next)
      // Index meal id → assignment id for the inline toggle. The
      // `meal_logs` upsert needs both.
      const lookup = new Map<string, string>()
      for (const a of list) {
        for (const m of a.meal_plan.meals) {
          if (m.id) lookup.set(m.id, a.id)
        }
      }
      setAssignmentByMealId(lookup)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, clientId, loggedDate])

  const meals = useMemo(() => {
    if (!assignments)
      return [] as { id: string; name: string; time: string | null }[]
    const out: { id: string; name: string; time: string | null }[] = []
    for (const a of assignments) {
      for (const m of a.meal_plan.meals) {
        if (!m.id) continue
        out.push({ id: m.id, name: m.name, time: m.time ?? null })
      }
    }
    // Order: timed meals first chronologically, then untimed last.
    // `numberMealsForDay` uses the same sort, so its "meal N of day"
    // numbering matches the order we render here.
    out.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    })
    return out
  }, [assignments])

  // Map mealId → "meal N of the day" for the unnamed-meal fallback.
  // Shared with the meal logger and the missed-meal banner so the same
  // meal renders as "Meal 3" everywhere.
  const numberByMeal = useMemo(() => numberMealsForDay(meals), [meals])

  // Inline toggle: flip a meal's eaten state from the Today card itself
  // so the user doesn't have to navigate into the meal logger to check
  // off "ate breakfast." Optimistic — the local Set updates immediately,
  // and `queuedUpsert` handles offline + retries. Rolls back on real
  // (non-network) errors.
  const toggleMeal = async (mealId: string) => {
    const assignmentId = assignmentByMealId.get(mealId)
    if (!assignmentId) return
    const wasEaten = eaten.has(mealId)
    const nextEaten = !wasEaten
    setEaten(prev => {
      const next = new Set(prev)
      if (nextEaten) next.add(mealId)
      else next.delete(mealId)
      return next
    })
    const { error } = await queuedUpsert(
      supabase,
      'meal_logs',
      {
        assignment_id: assignmentId,
        meal_id: mealId,
        user_id: clientId,
        logged_date: loggedDate,
        completed: nextEaten,
      },
      { onConflict: 'meal_id,user_id,logged_date' }
    )
    if (error) {
      // Roll back the optimistic flip.
      setEaten(prev => {
        const rolled = new Set(prev)
        if (wasEaten) rolled.add(mealId)
        else rolled.delete(mealId)
        return rolled
      })
      showToast('Failed to update meal', 'error')
    }
  }

  const eatenCount = meals.filter(m => eaten.has(m.id)).length
  const totalCount = meals.length

  // Per-meal status precomputed in a memo so `Date.now()` isn't called
  // during render (the lint rule flags it as impure). The `minuteTick`
  // dep keeps the result fresh as scheduled meal times pass.
  const statusByMeal = useMemo(() => {
    const MISSED_GRACE_MS = 30 * 60 * 1000
    const now = Date.now()
    const map = new Map<string, 'eaten' | 'missed' | 'upcoming'>()
    for (const m of meals) {
      if (eaten.has(m.id)) {
        map.set(m.id, 'eaten')
        continue
      }
      if (!m.time) {
        map.set(m.id, 'upcoming')
        continue
      }
      const [h, mi] = m.time.split(':').map(Number)
      if (Number.isNaN(h) || Number.isNaN(mi)) {
        map.set(m.id, 'upcoming')
        continue
      }
      const sched = new Date()
      sched.setHours(h, mi, 0, 0)
      map.set(
        m.id,
        now > sched.getTime() + MISSED_GRACE_MS ? 'missed' : 'upcoming'
      )
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- minuteTick is the freshness signal
  }, [meals, eaten, minuteTick])

  return (
    <Card onClick={onOpen} accent="amber" icon={Utensils} label="Meals">
      {loading ? (
        <CardSkeletonBody lines={3} />
      ) : meals.length === 0 ? (
        <CardEmpty
          icon={Utensils}
          title="No meals planned"
          description="Assign a meal plan to start tracking nutrition."
        />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900 tabular-nums">
              {eatenCount}
              <span className="text-slate-400 font-normal"> / {totalCount} eaten</span>
            </p>
            <p className="text-xs text-slate-500 shrink-0">
              {totalCount - eatenCount === 0
                ? 'All done'
                : `${totalCount - eatenCount} to go`}
            </p>
          </div>
          <ProgressBar value={eatenCount} total={totalCount} tone="amber" />
          <ul className="space-y-1.5 mt-2">
            {meals.slice(0, 5).map(m => {
              const status = statusByMeal.get(m.id) ?? 'upcoming'
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggleMeal(m.id)}
                    aria-pressed={status === 'eaten'}
                    aria-label={
                      status === 'eaten'
                        ? `Mark ${mealDisplayName(m.name, numberByMeal.get(m.id))} not eaten`
                        : `Mark ${mealDisplayName(m.name, numberByMeal.get(m.id))} eaten`
                    }
                    className="w-full flex items-center gap-2 text-xs text-left rounded-md px-1 py-1 -mx-1 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <StatusDot status={status} />
                    <span
                      className={`truncate ${
                        status === 'eaten' ? 'text-slate-400 line-through' : 'text-slate-700'
                      }`}
                    >
                      {mealDisplayName(m.name, numberByMeal.get(m.id))}
                    </span>
                    {m.time && (
                      <span className="ml-auto text-[10px] tabular-nums text-slate-400 shrink-0">
                        {m.time.slice(0, 5)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            {meals.length > 5 && (
              <li className="text-[11px] text-slate-400 italic px-1">
                + {meals.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
  )
}

function StatusDot({ status }: { status: 'eaten' | 'missed' | 'upcoming' }) {
  if (status === 'eaten') {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
        <Check size={10} />
      </span>
    )
  }
  if (status === 'missed') {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-700 shrink-0">
        <AlertTriangle size={10} />
      </span>
    )
  }
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-slate-400 shrink-0">
      <Clock size={10} />
    </span>
  )
}

// ── Weight card ─────────────────────────────────────────────────────────

function WeightCard({
  userId,
  weightUnit,
  onOpen,
}: {
  userId: string
  weightUnit: WeightUnit
  onOpen: () => void
}) {
  const supabase = useSupabase()
  const [logs, setLogs] = useState<WeightLog[] | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  // Bumping `refreshTick` forces the load effect to re-run after a
  // successful log. The async load + cancel-guard pattern keeps the
  // setState behind an `await`, which the eslint plugin accepts; calling
  // a sync function that internally setStates would trip the rule.
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await cachedQuery<WeightLog[]>(
        // Same cache key as WeightTracker — opening Today refreshes the
        // shared cache, and vice versa.
        `weight_logs:${userId}:recent30`,
        () =>
          supabase
            .from('weight_logs')
            .select('*')
            .eq('user_id', userId)
            .order('recorded_at', { ascending: false })
            .limit(30)
      )
      if (!cancelled) setLogs(data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, userId, refreshTick])

  const latest = logs?.[0] ?? null
  const today = todayISO()
  const loggedToday = latest?.recorded_at === today

  const daysSince = latest
    ? Math.max(0, daysBetween(latest.recorded_at, today))
    : null

  const handleLog = async () => {
    const weight = parseFloat(draft)
    if (!draft || Number.isNaN(weight) || weight <= 0) {
      showToast('Enter a valid weight', 'error')
      return
    }
    setSaving(true)
    const { error } = await queuedUpsert(
      supabase,
      'weight_logs',
      { user_id: userId, recorded_at: today, weight },
      { onConflict: 'user_id,recorded_at' }
    )
    if (error) {
      showToast('Failed to log weight', 'error')
    } else {
      showToast('Weight logged')
      setDraft('')
      // Trigger a re-fetch via the load effect — see comment by
      // `refreshTick` for why we don't call an async fetcher directly.
      setRefreshTick(t => t + 1)
    }
    setSaving(false)
  }

  return (
    <Card onClick={onOpen} accent="indigo" icon={Scale} label="Weight">
      {logs === null ? (
        <CardSkeletonBody lines={1} />
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900">
              {latest ? (
                <>
                  {roundMacro(latest.weight)}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    {weightUnit}
                  </span>
                </>
              ) : (
                <span className="text-slate-400 italic font-normal">
                  No entries yet
                </span>
              )}
            </p>
            {latest && (
              <p className="text-xs text-slate-500 shrink-0">
                {loggedToday
                  ? 'Logged today'
                  : daysSince === 1
                    ? 'Yesterday'
                    : daysSince != null
                      ? `${daysSince} days ago`
                      : formatDate(latest.recorded_at)}
              </p>
            )}
          </div>
          <WeightWeekStrip logs={logs} todayISO={today} />
          {!loggedToday && (
            <form
              onSubmit={e => {
                e.preventDefault()
                handleLog()
              }}
              className="grid grid-cols-[1fr_auto] gap-2"
            >
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={`Today's weight (${weightUnit})`}
                className="text-sm py-2"
              />
              <Button
                type="submit"
                size="sm"
                loading={saving}
                disabled={!draft}
              >
                {saving ? 'Saving…' : 'Log'}
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

// Compact 7-day strip — one dot per day (last week → today, left to
// right). Filled indigo if a weight was logged that day, hollow if not.
// Today is ringed so the user can scan whether they've already logged.
// Hover/long-press a filled dot to see the weight via the native title.
function WeightWeekStrip({
  logs,
  todayISO: today,
}: {
  logs: WeightLog[]
  todayISO: string
}) {
  // Build the 7 dates and a per-date lookup of the logged weight.
  const days = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const l of logs) byDate.set(l.recorded_at, l.weight)
    const arr: { date: string; weight: number | null; isToday: boolean }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = shiftISO(today, -i)
      arr.push({
        date: d,
        weight: byDate.get(d) ?? null,
        isToday: d === today,
      })
    }
    return arr
  }, [logs, today])

  return (
    <div className="flex items-center justify-between gap-1 pt-1">
      {days.map(d => {
        const dow = parseLocalISO(d.date).toLocaleDateString('en-US', {
          weekday: 'narrow',
        })
        const logged = d.weight != null
        return (
          <div
            key={d.date}
            className="flex flex-col items-center gap-1 min-w-0 flex-1"
            title={
              logged
                ? `${roundMacro(d.weight!)} on ${parseLocalISO(d.date).toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric' }
                  )}`
                : `No entry · ${parseLocalISO(d.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}`
            }
          >
            <span
              className={`block h-2.5 w-2.5 rounded-full ${
                logged
                  ? 'bg-indigo-500'
                  : 'bg-transparent border border-slate-200'
              } ${
                d.isToday
                  ? logged
                    ? 'ring-2 ring-indigo-200 ring-offset-1 ring-offset-white'
                    : 'border-indigo-400 ring-2 ring-indigo-100 ring-offset-1 ring-offset-white'
                  : ''
              }`}
              aria-hidden
            />
            <span
              className={`text-[9px] font-medium tabular-nums ${
                d.isToday ? 'text-indigo-700' : 'text-slate-400'
              }`}
            >
              {dow}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Body measurement card ───────────────────────────────────────────────

// Compact "when did I last measure" card — measurements are weekly-ish,
// not daily, so this stays a single-row tile. Tap to jump to the full
// Body view for logging a new entry.
function BodyMeasurementCard({
  userId,
  onOpen,
}: {
  userId: string
  onOpen: () => void
}) {
  const supabase = useSupabase()
  const [latest, setLatest] = useState<{ recorded_at: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await cachedQuery<Array<{ recorded_at: string }>>(
        `body_measurements_latest:${userId}`,
        () =>
          supabase
            .from('body_measurements')
            .select('recorded_at')
            .eq('user_id', userId)
            .order('recorded_at', { ascending: false })
            .limit(1)
      )
      if (cancelled) return
      setLatest((data ?? [])[0] ?? null)
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  const today = todayISO()
  const daysSince = latest ? Math.max(0, daysBetween(latest.recorded_at, today)) : null

  return (
    <Card onClick={onOpen} accent="purple" icon={Ruler} label="Measurements">
      {!loaded ? (
        <CardSkeletonBody lines={1} />
      ) : !latest ? (
        <p className="text-sm text-slate-500">
          No measurements yet. Tap to record neck / waist / arms / legs.
        </p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-slate-900">
            Last measured
          </p>
          <p className="text-xs text-slate-500 shrink-0">
            {daysSince === 0
              ? 'Today'
              : daysSince === 1
                ? 'Yesterday'
                : daysSince != null
                  ? `${daysSince} days ago`
                  : formatDate(latest.recorded_at)}
          </p>
        </div>
      )}
    </Card>
  )
}

// ── Streak card ─────────────────────────────────────────────────────────

function StreakCard({
  clientId,
  onOpen,
}: {
  clientId: string
  onOpen: () => void
}) {
  const supabase = useSupabase()
  const [streak, setStreak] = useState<number | null>(null)
  const [thisWeek, setThisWeek] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // Pull recent logged_dates and count back-to-back streak from today.
      // The cache key intentionally doesn't include a date — the streak
      // moves day-to-day but the read is cheap and the value is shared
      // with the WorkoutHistory progress view.
      const { data } = await cachedQuery<Array<{ logged_date: string }>>(
        `streak_logs:${clientId}`,
        () =>
          supabase
            .from('set_logs')
            .select('logged_date')
            .eq('completed', true)
            .order('logged_date', { ascending: false })
            .limit(60)
      )
      if (cancelled) return
      const dates = new Set((data ?? []).map(r => r.logged_date))
      // Streak: count consecutive days going back from today, allowing
      // "today not yet logged" to use yesterday as the anchor (avoids
      // breaking a streak before the user has had a chance to lift).
      const today = todayISO()
      let s = 0
      let cursor = today
      if (!dates.has(cursor)) {
        // Today is not yet logged — try starting from yesterday so the
        // streak shows what the user achieved through yesterday.
        cursor = shiftISO(cursor, -1)
      }
      while (dates.has(cursor)) {
        s += 1
        cursor = shiftISO(cursor, -1)
      }
      setStreak(s)

      // This-week count: how many distinct days hit in the last 7 days.
      const weekDates = new Set<string>()
      for (let i = 0; i < 7; i++) {
        const d = shiftISO(today, -i)
        if (dates.has(d)) weekDates.add(d)
      }
      setThisWeek(weekDates.size)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, clientId])

  return (
    <Card onClick={onOpen} accent="purple" icon={Flame} label="Streak">
      {streak === null ? (
        <CardSkeletonBody lines={1} />
      ) : streak === 0 ? (
        <p className="text-sm text-slate-500">
          Log a workout today to start a streak.
        </p>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-slate-900">
            <span className="text-2xl tabular-nums">{streak}</span>
            <span className="text-sm text-slate-500 font-normal">
              {' '}
              {streak === 1 ? 'day' : 'days'} in a row
            </span>
          </p>
          <p className="text-xs text-slate-500 shrink-0 tabular-nums">
            {thisWeek}/7 this week
          </p>
        </div>
      )}
    </Card>
  )
}

// `lib/utils.ts` already exports `shiftDateISO` — local alias keeps the
// streak loop readable.
function shiftISO(dateISO: string, days: number): string {
  const d = parseLocalISO(dateISO)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Shared building blocks ──────────────────────────────────────────────

const ACCENTS = {
  emerald: {
    iconBg: 'bg-emerald-50 text-emerald-600',
    progress: 'bg-emerald-500',
  },
  amber: {
    iconBg: 'bg-amber-50 text-amber-600',
    progress: 'bg-amber-500',
  },
  indigo: {
    iconBg: 'bg-indigo-50 text-indigo-600',
    progress: 'bg-indigo-500',
  },
  purple: {
    iconBg: 'bg-purple-50 text-purple-600',
    progress: 'bg-purple-500',
  },
} as const

function Card({
  icon: Icon,
  label,
  accent,
  onClick,
  children,
}: {
  icon: typeof Dumbbell
  label: string
  accent: keyof typeof ACCENTS
  onClick: () => void
  children: React.ReactNode
}) {
  // Container is a div so nested interactive elements (toggles, mini-
  // log forms) don't violate the HTML rule against button-in-button.
  // The "navigate to the full view" affordance is a small button in the
  // top-right corner instead, with an explicit aria-label.
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all">
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={`h-9 w-9 rounded-xl flex items-center justify-center ${ACCENTS[accent].iconBg}`}
        >
          <Icon size={16} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <button
          type="button"
          onClick={onClick}
          aria-label={`Open ${label}`}
          className="ml-auto h-7 w-7 rounded-md flex items-center justify-center text-slate-300 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <ArrowRight size={14} />
        </button>
      </div>
      {children}
    </div>
  )
}

function ProgressBar({
  value,
  total,
  tone,
}: {
  value: number
  total: number
  tone: keyof typeof ACCENTS
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full ${ACCENTS[tone].progress} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function CardSkeletonBody({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-slate-200/70 rounded animate-pulse"
          style={{ width: `${[80, 60, 70, 50][i % 4]}%` }}
        />
      ))}
    </div>
  )
}

function CardEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Dumbbell
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={18} className="text-slate-300 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-slate-700">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </div>
  )
}

// Re-exports for the mobile bottom-nav so the file can register the
// "Today" icon without importing from this implementation file.
export { ClipboardList, Utensils, Ruler }

// ── Coach section ───────────────────────────────────────────────────────

function CoachSection({
  coachId,
  onNavigate,
}: {
  coachId: string
  onNavigate: (tab: TodayNavTarget) => void
}) {
  const supabase = useSupabase()
  const [counts, setCounts] = useState<{
    clients: number
    workouts: number
    programs: number
    mealPlans: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Fire all four counts in parallel. `head: true` + `count: 'exact'`
      // tells PostgREST to return only the count without the rows — cheap.
      const [clientsRes, workoutsRes, programsRes, mealPlansRes] = await Promise.all([
        cachedQuery<{ count: number }>(
          `count_clients:${coachId}`,
          () =>
            supabase
              .from('coach_client_relationships')
              .select('client_id', { count: 'exact', head: true })
              .eq('coach_id', coachId)
              .eq('status', 'active')
              .neq('client_id', coachId)
              .then(r => ({ data: { count: r.count ?? 0 }, error: r.error })),
        ),
        cachedQuery<{ count: number }>(
          `count_workouts:${coachId}`,
          () =>
            supabase
              .from('workouts')
              .select('id', { count: 'exact', head: true })
              .eq('coach_id', coachId)
              .then(r => ({ data: { count: r.count ?? 0 }, error: r.error })),
        ),
        cachedQuery<{ count: number }>(
          `count_programs:${coachId}`,
          () =>
            supabase
              .from('workout_programs')
              .select('id', { count: 'exact', head: true })
              .eq('coach_id', coachId)
              .then(r => ({ data: { count: r.count ?? 0 }, error: r.error })),
        ),
        cachedQuery<{ count: number }>(
          `count_meal_plans:${coachId}`,
          () =>
            supabase
              .from('meal_plans')
              .select('id', { count: 'exact', head: true })
              .eq('coach_id', coachId)
              .then(r => ({ data: { count: r.count ?? 0 }, error: r.error })),
        ),
      ])
      if (cancelled) return
      setCounts({
        clients: clientsRes.data?.count ?? 0,
        workouts: workoutsRes.data?.count ?? 0,
        programs: programsRes.data?.count ?? 0,
        mealPlans: mealPlansRes.data?.count ?? 0,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, coachId])

  // Skip the whole section while loading is still null AND there's never
  // been any coaching content. Once there's at least one client or one
  // template, the section sticks around.
  if (!counts) {
    return (
      <section className="space-y-3">
        <SectionHeader title="Coaching" />
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <CardSkeletonBody lines={2} />
        </div>
      </section>
    )
  }

  const hasAny =
    counts.clients > 0 ||
    counts.workouts > 0 ||
    counts.programs > 0 ||
    counts.mealPlans > 0
  if (!hasAny) {
    // First-run: empty Coaching section is just a soft CTA tile. Tap
    // routes to the workout library where they can build their first one.
    return (
      <section className="space-y-3">
        <SectionHeader title="Coaching" />
        <button
          type="button"
          onClick={() => onNavigate('my-workouts')}
          className="w-full text-left bg-white rounded-2xl border border-dashed border-slate-300 p-5 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
              <Dumbbell size={16} />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-slate-700">
                Build your first workout
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Coach yourself or invite a client — same tools either way.
              </p>
            </div>
            <ArrowRight size={14} className="ml-auto text-slate-300" />
          </div>
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Coaching" />
      <Card
        icon={Users}
        label="Clients"
        accent="indigo"
        onClick={() => onNavigate('my-clients')}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-slate-900">
            <span className="text-2xl tabular-nums">{counts.clients}</span>
            <span className="text-sm text-slate-500 font-normal">
              {' '}
              {counts.clients === 1 ? 'client' : 'clients'}
            </span>
          </p>
          <p className="text-xs text-slate-500 shrink-0">
            {counts.clients === 0 ? 'Invite to start' : 'Manage'}
          </p>
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        <LibraryTile
          label="Workouts"
          count={counts.workouts}
          icon={Dumbbell}
          onClick={() => onNavigate('my-workouts')}
        />
        <LibraryTile
          label="Programs"
          count={counts.programs}
          icon={ListChecks}
          onClick={() => onNavigate('my-programs')}
        />
        <LibraryTile
          label="Meal plans"
          count={counts.mealPlans}
          icon={Apple}
          onClick={() => onNavigate('my-meal-plans')}
        />
      </div>
    </section>
  )
}

function LibraryTile({
  label,
  count,
  icon: Icon,
  onClick,
}: {
  label: string
  count: number
  icon: typeof Dumbbell
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-3 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer text-left"
    >
      <Icon size={14} className="text-slate-400 mb-1.5" />
      <p className="text-lg font-bold text-slate-900 tabular-nums leading-tight">
        {count}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 mt-0.5">
        {label}
      </p>
    </button>
  )
}
