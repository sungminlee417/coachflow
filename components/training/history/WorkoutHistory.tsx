'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Flame, TrendingUp, Activity, HeartPulse } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { formatDate, formatDuration, todayISO } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { queryKeys } from '@/lib/query-keys'
import { StatRowSkeleton, SummaryTilesSkeleton } from '@/components/ui/Skeleton'
import { ActivityHeatmap } from './ActivityHeatmap'
import { SummaryTile } from './SummaryTile'

interface WorkoutHistoryProps {
  clientId: string
}

interface ExerciseStats {
  /** Lowercased exercise name — used as the grouping key. */
  key: string
  /** Display name (preserves original capitalization from the most recent log). */
  name: string
  type: 'strength' | 'cardio'
  totalSets: number
  totalReps: number
  totalVolume: number
  // Strength PR
  bestWeight: number | null
  bestWeightReps: number | null
  bestWeightDate: string | null
  // Cardio PR
  longestDurationSeconds: number | null
  longestDurationDate: string | null
  lastLoggedDate: string
}

interface SetLogRow {
  reps_performed: number | null
  weight_performed: number | null
  duration_performed_seconds: number | null
  logged_date: string
  exercise: {
    name: string | null
    exercise_type: string | null
  } | { name: string | null; exercise_type: string | null }[] | null
}

const unwrap = <T,>(v: T | T[] | null | undefined): T | null => {
  if (Array.isArray(v)) return v[0] ?? null
  return (v ?? null) as T | null
}

// Epley formula — the trainee-facing estimate of a 1-rep max from a
// sub-max set. We clamp the rep range because the formula degrades fast
// once you go past about 10 reps; better to show "—" than a number that
// makes the trainee load weight they can't move.
const estimateOneRepMax = (
  weight: number | null,
  reps: number | null
): number | null => {
  if (weight == null || reps == null) return null
  if (weight <= 0 || reps <= 0) return null
  if (reps === 1) return weight
  if (reps > 12) return null
  return Math.round(weight * (1 + reps / 30))
}

const EMPTY_STATS: ExerciseStats[] = []
const EMPTY_LOGGED_DATES: Set<string> = new Set()

export default function WorkoutHistory({ clientId }: WorkoutHistoryProps) {
  const supabase = useSupabase()
  // Lifetime stats query — the save mutation invalidates this key,
  // so PRs and heatmap stay in sync without a manual refetch.
  const historyQuery = useQuery({
    queryKey: queryKeys.setLogs.lifetime(clientId),
    queryFn: async (): Promise<SetLogRow[]> => {
      const { data, error } = await supabase
        .from('set_logs')
        .select(`
          reps_performed, weight_performed, duration_performed_seconds, logged_date,
          exercise:exercise_id ( name, exercise_type ),
          assignment:assignment_id!inner ( client_id )
        `)
        .eq('assignment.client_id', clientId)
      if (error) throw error
      return (data ?? []) as SetLogRow[]
    },
  })
  const loading = historyQuery.isLoading && !historyQuery.isSuccess

  // `Date.now()` is impure; lift it out of the memo body so the React-19
  // purity lint rule doesn't trip and so the memo keys off a stable
  // anchor for the day. Re-anchored when the underlying data changes.
  const todayAnchor = useMemo(
    () => new Date(todayISO() + 'T00:00:00').getTime(),
    []
  )

  const { stats, totals, loggedDates } = useMemo(() => {
    if (!historyQuery.data) {
      return {
        stats: EMPTY_STATS,
        totals: { sessionDays: 0, weekDays: 0, monthDays: 0, totalSets: 0 },
        loggedDates: EMPTY_LOGGED_DATES,
      }
    }
    const byExercise = new Map<string, ExerciseStats>()
    const sessionDays = new Set<string>()
    let totalSets = 0

    for (const row of historyQuery.data) {
      const ex = unwrap(row.exercise)
      if (!ex?.name) continue
      const key = ex.name.toLowerCase()
      const isCardio = ex.exercise_type === 'cardio'
      sessionDays.add(row.logged_date)
      totalSets += 1

      const reps = row.reps_performed ?? 0
      const weight = row.weight_performed ?? 0
      const duration = row.duration_performed_seconds ?? 0

      const existing =
        byExercise.get(key) ??
        ({
          key,
          name: ex.name,
          type: isCardio ? 'cardio' : 'strength',
          totalSets: 0,
          totalReps: 0,
          totalVolume: 0,
          bestWeight: null,
          bestWeightReps: null,
          bestWeightDate: null,
          longestDurationSeconds: null,
          longestDurationDate: null,
          lastLoggedDate: row.logged_date,
        } as ExerciseStats)

      existing.totalSets += 1
      if (!isCardio) {
        existing.totalReps += reps
        existing.totalVolume += weight * reps
        if (weight > 0 && (existing.bestWeight == null || weight > existing.bestWeight)) {
          existing.bestWeight = weight
          existing.bestWeightReps = reps || null
          existing.bestWeightDate = row.logged_date
        }
      } else if (
        duration > 0 &&
        (existing.longestDurationSeconds == null ||
          duration > existing.longestDurationSeconds)
      ) {
        existing.longestDurationSeconds = duration
        existing.longestDurationDate = row.logged_date
      }
      if (row.logged_date.localeCompare(existing.lastLoggedDate) > 0) {
        existing.lastLoggedDate = row.logged_date
        existing.name = ex.name
      }
      byExercise.set(key, existing)
    }

    const list = Array.from(byExercise.values())
    list.sort((a, b) => b.lastLoggedDate.localeCompare(a.lastLoggedDate))

    const weekDays = new Set<string>()
    const monthDays = new Set<string>()
    for (const d of sessionDays) {
      const t = new Date(`${d}T00:00:00`).getTime()
      const diff = todayAnchor - t
      if (diff <= 7 * 86400_000) weekDays.add(d)
      if (diff <= 30 * 86400_000) monthDays.add(d)
    }
    return {
      stats: list,
      totals: {
        sessionDays: sessionDays.size,
        weekDays: weekDays.size,
        monthDays: monthDays.size,
        totalSets,
      },
      loggedDates: sessionDays,
    }
  }, [historyQuery.data, todayAnchor])

  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Progress</h2>
        <p className="text-sm text-muted mb-6">
          Personal records and lifetime stats from every set you&rsquo;ve logged.
        </p>
        <div className="mb-6">
          <SummaryTilesSkeleton count={4} />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatRowSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-foreground mb-1">Progress</h2>
      <p className="text-sm text-muted mb-6">
        Personal records and lifetime stats from every set you&rsquo;ve logged.
      </p>

      {/* Summary tiles. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryTile
          icon={<Flame size={16} />}
          label="This week"
          value={`${totals.weekDays}`}
          sub={totals.weekDays === 1 ? 'session' : 'sessions'}
          tone="indigo"
        />
        <SummaryTile
          icon={<Activity size={16} />}
          label="This month"
          value={`${totals.monthDays}`}
          sub={totals.monthDays === 1 ? 'session' : 'sessions'}
          tone="emerald"
        />
        <SummaryTile
          icon={<TrendingUp size={16} />}
          label="All-time"
          value={`${totals.sessionDays}`}
          sub={totals.sessionDays === 1 ? 'session' : 'sessions'}
          tone="purple"
        />
        <SummaryTile
          icon={<Trophy size={16} />}
          label="Sets logged"
          value={`${totals.totalSets}`}
          sub="across all"
          tone="amber"
        />
      </div>

      {/* Calendar heatmap: last 12 weeks. Filled cells = days the trainee
          logged at least one set. Helps spot consistency at a glance. */}
      {loggedDates.size > 0 && (
        <div className="mb-6">
          <ActivityHeatmap loggedDates={loggedDates} />
        </div>
      )}

      {/* Recent PRs — the 5 most recently set lifetime bests across every
          exercise. Surfaces the "I just set a new PR" feel even when the
          trainee scrolled past the per-exercise list. */}
      <RecentPRsCard stats={stats} />

      {stats.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No PRs yet"
          description="Log a few sets and your personal records will start showing up here."
        />
      ) : (
        <div className="space-y-2">
          {stats.map(s => {
            const isCardio = s.type === 'cardio'
            const hasStat = isCardio
              ? s.longestDurationSeconds != null
              : s.bestWeight != null
            return (
              <div
                key={s.key}
                className="bg-surface rounded-xl border border-line p-4 hover:border-indigo-line transition-colors"
              >
                {/* Grid (not flex-wrap) so the right-side stat keeps its
                    column even when the exercise name is long — flex-wrap
                    used to push the stat below the name on narrow widths,
                    which broke the visual alignment across the list. */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate min-w-0">
                        {s.name}
                      </h3>
                      {isCardio && (
                        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-semibold text-amber-fg bg-amber-strong border border-amber-line rounded px-1.5 py-px shrink-0">
                          <HeartPulse size={10} />
                          Cardio
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-subtle mt-1 tabular-nums">
                      Last {formatDate(s.lastLoggedDate)}
                      <span className="text-faint"> · </span>
                      {s.totalSets} {s.totalSets === 1 ? 'set' : 'sets'}
                    </p>
                  </div>
                  {/* Right column reserves the same vertical footprint
                      whether or not we have a stat — keeps the row of
                      cards visually consistent down the page. */}
                  <div className="text-right shrink-0 min-w-22">
                    {hasStat ? (
                      isCardio ? (
                        <>
                          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
                            {formatDuration(s.longestDurationSeconds!)}
                          </p>
                          <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-fg mt-0.5">
                            Longest
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
                            {s.bestWeight}
                            {s.bestWeightReps != null && (
                              <span className="text-sm font-medium text-muted">
                                {' × '}
                                {s.bestWeightReps}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] uppercase tracking-widest font-semibold text-emerald-fg mt-0.5">
                            Heaviest
                          </p>
                          {(() => {
                            const e1rm = estimateOneRepMax(s.bestWeight, s.bestWeightReps)
                            // Only render the chip when reps > 1 — for a true
                            // single, the "Heaviest" line is already the 1RM
                            // and a duplicate chip would just be noise.
                            if (e1rm == null || (s.bestWeightReps ?? 0) <= 1) return null
                            return (
                              <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-fg bg-indigo-soft border border-indigo-line rounded-full px-1.5 py-px tabular-nums">
                                e1RM <span className="font-bold">{e1rm}</span>
                              </p>
                            )
                          })()}
                        </>
                      )
                    ) : (
                      <>
                        <p className="text-lg font-bold text-faint tabular-nums leading-tight">
                          —
                        </p>
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-subtle mt-0.5">
                          No PR yet
                        </p>
                      </>
                    )}
                  </div>
                  {!isCardio && s.totalVolume > 0 && (
                    <p className="col-span-2 text-[11px] text-muted tabular-nums pt-2 border-t border-line-subtle">
                      Total volume{' '}
                      <span className="font-semibold text-foreground">
                        {Math.round(s.totalVolume).toLocaleString()}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecentPRsCard({ stats }: { stats: ExerciseStats[] }) {
  const recent = useMemo(() => {
    type Row = {
      key: string
      name: string
      type: 'strength' | 'cardio'
      headline: string
      sub: string | null
      date: string
    }
    const out: Row[] = []
    for (const s of stats) {
      if (s.type === 'cardio') {
        if (s.longestDurationSeconds == null || !s.longestDurationDate) continue
        out.push({
          key: s.key,
          name: s.name,
          type: 'cardio',
          headline: formatDuration(s.longestDurationSeconds),
          sub: 'Longest',
          date: s.longestDurationDate,
        })
      } else {
        if (s.bestWeight == null || !s.bestWeightDate) continue
        const e1rm = estimateOneRepMax(s.bestWeight, s.bestWeightReps)
        const headline = `${s.bestWeight}${
          s.bestWeightReps != null ? ` × ${s.bestWeightReps}` : ''
        }`
        out.push({
          key: s.key,
          name: s.name,
          type: 'strength',
          headline,
          sub: e1rm != null && (s.bestWeightReps ?? 0) > 1 ? `e1RM ${e1rm}` : null,
          date: s.bestWeightDate,
        })
      }
    }
    out.sort((a, b) => b.date.localeCompare(a.date))
    return out.slice(0, 5)
  }, [stats])

  if (recent.length === 0) return null

  return (
    <div className="mb-6 bg-surface rounded-xl border border-line p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={14} className="text-amber-fg" />
        <h3 className="text-sm font-semibold text-foreground">Recent personal records</h3>
        <span className="text-[10px] text-subtle">· top {recent.length}</span>
      </div>
      <ul className="divide-y divide-line-subtle">
        {recent.map(row => (
          <li
            key={row.key}
            className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
              <p className="text-[11px] text-subtle tabular-nums">
                {formatDate(row.date)}
                {row.sub && (
                  <>
                    <span className="text-faint"> · </span>
                    <span className="text-indigo-fg font-semibold">{row.sub}</span>
                  </>
                )}
              </p>
            </div>
            <p
              className={`text-base font-bold tabular-nums shrink-0 ${
                row.type === 'cardio' ? 'text-amber-fg' : 'text-emerald-fg'
              }`}
            >
              {row.headline}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

