'use client'

import { useEffect, useState } from 'react'
import { Trophy, Flame, TrendingUp, Activity } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { formatDate, formatDuration } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'

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

export default function WorkoutHistory({ clientId }: WorkoutHistoryProps) {
  const supabase = useSupabase()
  const [stats, setStats] = useState<ExerciseStats[]>([])
  const [totals, setTotals] = useState({
    sessionDays: 0,
    weekDays: 0,
    monthDays: 0,
    totalSets: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchHistory = async () => {
    try {
      // Pull every set log this trainee has ever recorded, joined to its
      // exercise for the name + type. PostgREST nests joins, so the row's
      // `exercise` field is either an object or a single-element array.
      const { data, error } = await supabase
        .from('set_logs')
        .select(`
          reps_performed, weight_performed, duration_performed_seconds, logged_date,
          exercise:exercise_id ( name, exercise_type ),
          assignment:assignment_id!inner ( client_id )
        `)
        .eq('assignment.client_id', clientId)
      if (error) throw error

      const byExercise = new Map<string, ExerciseStats>()
      const sessionDays = new Set<string>()
      let totalSets = 0

      for (const row of (data ?? []) as SetLogRow[]) {
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
        } else {
          if (
            duration > 0 &&
            (existing.longestDurationSeconds == null ||
              duration > existing.longestDurationSeconds)
          ) {
            existing.longestDurationSeconds = duration
            existing.longestDurationDate = row.logged_date
          }
        }
        if (row.logged_date.localeCompare(existing.lastLoggedDate) > 0) {
          existing.lastLoggedDate = row.logged_date
          // Pick up the most recent capitalization variant if it's been edited.
          existing.name = ex.name
        }
        byExercise.set(key, existing)
      }

      const list = Array.from(byExercise.values())
      // Most recent activity first — matches what people scan for.
      list.sort((a, b) => b.lastLoggedDate.localeCompare(a.lastLoggedDate))

      const today = new Date()
      const todayMs = today.getTime()
      const weekDays = new Set<string>()
      const monthDays = new Set<string>()
      for (const d of sessionDays) {
        const t = new Date(`${d}T00:00:00`).getTime()
        const diff = todayMs - t
        if (diff <= 7 * 86400_000) weekDays.add(d)
        if (diff <= 30 * 86400_000) monthDays.add(d)
      }

      setStats(list)
      setTotals({
        sessionDays: sessionDays.size,
        weekDays: weekDays.size,
        monthDays: monthDays.size,
        totalSets,
      })
    } catch {
      // Silent — empty state handles it.
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Progress</h2>
        <ListSkeleton count={5} />
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">Progress</h2>
      <p className="text-sm text-slate-500 mb-6">
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

      {stats.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No PRs yet"
          description="Log a few sets and your personal records will start showing up here."
        />
      ) : (
        <div className="space-y-2">
          {stats.map(s => (
            <div
              key={s.key}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 truncate">{s.name}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Last performed {formatDate(s.lastLoggedDate)}
                    {' · '}
                    {s.totalSets} {s.totalSets === 1 ? 'set' : 'sets'} all-time
                    {s.type === 'cardio' && (
                      <span className="ml-1 text-amber-600">· cardio</span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {s.type === 'cardio' ? (
                    s.longestDurationSeconds != null ? (
                      <>
                        <p className="text-lg font-bold text-slate-900 tabular-nums">
                          {formatDuration(s.longestDurationSeconds)}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-600">
                          Longest
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No duration logged</p>
                    )
                  ) : s.bestWeight != null ? (
                    <>
                      <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {s.bestWeight}
                        {s.bestWeightReps != null && (
                          <span className="text-sm font-medium text-slate-500">
                            {' × '}
                            {s.bestWeightReps}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest font-semibold text-emerald-600">
                        Heaviest
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No weight logged</p>
                  )}
                </div>
              </div>
              {s.type === 'strength' && s.totalVolume > 0 && (
                <p className="text-[11px] text-slate-500 mt-2 tabular-nums">
                  Total volume:{' '}
                  <span className="font-semibold text-slate-700">
                    {Math.round(s.totalVolume).toLocaleString()}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone: 'indigo' | 'emerald' | 'purple' | 'amber'
}) {
  const toneClasses = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  }[tone]

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest border ${toneClasses}`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  )
}
