'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { useAssignmentSync } from '@/lib/hooks/use-assignment-sync'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { sortLibrary, type LibrarySortMode } from '@/components/ui/LibrarySort'
import { LibraryFilterableGrid } from '@/components/ui/LibraryFilterableGrid'
import { Plus, Send, Pencil, Trash2, Dumbbell, Copy } from 'lucide-react'
import type { Workout } from '@/lib/types'
import { CardGridSkeleton } from '@/components/ui/Skeleton'
import dynamic from 'next/dynamic'
// The builder is ~1100 LOC + drag/drop + form state — only mounted when
// the coach taps "Create / Edit", so lazy-loading keeps the dashboard's
// initial JS chunk lean. `ssr: false` because the builder is fully client.
const WorkoutBuilder = dynamic(() => import('./WorkoutBuilder'), { ssr: false })
import WorkoutAssignmentModal from '../assignments/WorkoutAssignmentModal'

interface WorkoutLibraryProps {
  coachId: string
}

export default function WorkoutLibrary({ coachId }: WorkoutLibraryProps) {
  const supabase = useSupabase()
  const { invalidateWorkouts } = useAssignmentSync()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null)
  const [assigningWorkout, setAssigningWorkout] = useState<Workout | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<LibrarySortMode>('recent')

  const visibleWorkouts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? workouts.filter(w => w.name.toLowerCase().includes(q))
      : workouts
    return sortLibrary(filtered, sortMode)
  }, [workouts, query, sortMode])

  useEffect(() => {
    fetchWorkouts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from('workouts')
        .select(
          'id, name, description, is_template, days_of_week, cycle_length, cycle_position, created_at, exercises (count)'
        )
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const list = (data || []).map(w => ({
        ...w,
        exercise_count: w.exercises?.[0]?.count || 0,
      }))
      setWorkouts(list)
    } catch (err) {
      console.error('fetchWorkouts failed:', err)
      showToast('Failed to load workouts', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const { error } = await supabase.from('workouts').delete().eq('id', deletingId)
      if (error) throw error
      // ON DELETE CASCADE wipes workout_assignments + exercises + sets
      // for this workout. Refresh every cache that referenced them so
      // any open ClientWorkoutView / Today dashboard doesn't try to
      // render a ghost assignment.
      await Promise.all([fetchWorkouts(), invalidateWorkouts({ coachId })])
      showToast('Workout deleted')
    } catch {
      showToast('Failed to delete workout', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Deep-copy a workout (header + per-set exercise rows + alternatives)
  // into a new row owned by the same coach. The new row is `name + " (copy)"`
  // and the date columns reset so cycle/days-of-week assignments don't
  // accidentally fire for the duplicate before the coach reviews it.
  const handleDuplicate = async (workoutId: string) => {
    setDuplicatingId(workoutId)
    try {
      const { data: src } = await supabase
        .from('workouts')
        .select('*')
        .eq('id', workoutId)
        .maybeSingle()
      if (!src) throw new Error('Workout not found')

      // Build the destination header. Skip generated columns (id, timestamps).
      const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = src as {
        id: string
        created_at?: string
        updated_at?: string
        name: string
      } & Record<string, unknown>
      void _id; void _ca; void _ua
      const newWorkoutPayload = {
        ...rest,
        name: `${src.name} (copy)`,
        coach_id: coachId,
      }
      const { data: created, error: insertErr } = await supabase
        .from('workouts')
        .insert(newWorkoutPayload)
        .select('id')
        .single()
      if (insertErr || !created) throw insertErr ?? new Error('Insert failed')
      const newId = created.id as string

      // Pull source children and re-insert pointing at the new workout.
      const { data: exList } = await supabase
        .from('exercises')
        .select('*')
        .eq('workout_id', workoutId)
        .order('order_index')

      if (exList && exList.length > 0) {
        type ExRow = { id: string; workout_id?: string } & Record<string, unknown>
        const oldIds = exList.map(e => (e as ExRow).id)
        const newExPayload = exList.map(e => {
          const { id: _exId, created_at: _eca, updated_at: _eua, workout_id: _wid, ...exRest } =
            e as ExRow & { created_at?: string; updated_at?: string; workout_id?: string }
          void _exId; void _eca; void _eua; void _wid
          return { ...exRest, workout_id: newId }
        })
        const { data: newExRows, error: exErr } = await supabase
          .from('exercises')
          .insert(newExPayload)
          .select('id, order_index')
        if (exErr) throw exErr

        // Map old exercise_id → new exercise_id by order_index.
        const oldByOrder = new Map<number, string>()
        for (const o of exList as Array<{ id: string; order_index: number }>) {
          oldByOrder.set(o.order_index, o.id)
        }
        const newByOldId = new Map<string, string>()
        for (const n of (newExRows ?? []) as Array<{ id: string; order_index: number }>) {
          const oldId = oldByOrder.get(n.order_index)
          if (oldId) newByOldId.set(oldId, n.id)
        }

        // Copy per-set rows. Alternatives table may not exist on older
        // deploys — best-effort.
        const { data: setRows } = await supabase
          .from('exercise_sets')
          .select('*')
          .in('exercise_id', oldIds)
        if (setRows && setRows.length > 0) {
          const setsPayload: Record<string, unknown>[] = []
          for (const s of setRows) {
            const { id: _sid, created_at: _sca, exercise_id: oldExId, ...sRest } =
              s as { id: string; created_at?: string; exercise_id: string } & Record<string, unknown>
            void _sid; void _sca
            const newExId = newByOldId.get(oldExId)
            if (!newExId) continue
            setsPayload.push({ ...sRest, exercise_id: newExId })
          }
          if (setsPayload.length > 0) {
            await supabase.from('exercise_sets').insert(setsPayload)
          }
        }

        try {
          const { data: altRows } = await supabase
            .from('exercise_alternatives')
            .select('*')
            .in('exercise_id', oldIds)
          if (altRows && altRows.length > 0) {
            const altsPayload: Record<string, unknown>[] = []
            for (const a of altRows) {
              const { id: _aid, exercise_id: oldExId, ...aRest } =
                a as { id: string; exercise_id: string } & Record<string, unknown>
              void _aid
              const newExId = newByOldId.get(oldExId)
              if (!newExId) continue
              altsPayload.push({ ...aRest, exercise_id: newExId })
            }
            if (altsPayload.length > 0) {
              await supabase.from('exercise_alternatives').insert(altsPayload)
            }
          }
        } catch {
          // Alternatives are optional — silently skip if table is missing.
        }
      }

      await fetchWorkouts()
      showToast('Workout duplicated')
    } catch (err) {
      console.error('handleDuplicate failed:', err)
      showToast('Failed to duplicate workout', 'error')
    } finally {
      setDuplicatingId(null)
    }
  }

  if (showBuilder) {
    return (
      <WorkoutBuilder
        coachId={coachId}
        workout={editingWorkout}
        onClose={() => {
          setShowBuilder(false)
          setEditingWorkout(null)
          fetchWorkouts()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Workout Library</h2>
            <p className="text-sm text-subtle mt-1">Loading workouts…</p>
          </div>
        </div>
        <CardGridSkeleton count={6} />
      </div>
    )
  }

  return (
    <div>
      <WorkoutAssignmentModal
        open={!!assigningWorkout}
        coachId={coachId}
        workoutId={assigningWorkout?.id ?? ''}
        workoutName={assigningWorkout?.name ?? ''}
        cycleLength={assigningWorkout?.cycle_length ?? null}
        cyclePosition={assigningWorkout?.cycle_position ?? null}
        onClose={() => setAssigningWorkout(null)}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Delete workout?"
        message="This will permanently remove the workout and its exercises. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Workout Library</h2>
          <p className="text-sm text-muted mt-1">
            {workouts.length} {workouts.length === 1 ? 'workout' : 'workouts'}
          </p>
        </div>
        <Button
          onClick={() => { setEditingWorkout(null); setShowBuilder(true) }}
          className="w-full sm:w-auto"
        >
          <Plus size={16} />
          Create Workout
        </Button>
      </div>

      {workouts.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No workouts yet"
          description="Create your first workout template"
          action={
            <Button onClick={() => { setEditingWorkout(null); setShowBuilder(true) }}>
              <Plus size={16} />
              Create Your First Workout
            </Button>
          }
        />
      ) : (
        <LibraryFilterableGrid
          total={workouts.length}
          visibleCount={visibleWorkouts.length}
          query={query}
          onQueryChange={setQuery}
          sortMode={sortMode}
          onSortChange={setSortMode}
          searchPlaceholder="Search workouts…"
          emptyMatchLabel="workouts"
        >
          {visibleWorkouts.map(workout => (
            <div
              key={workout.id}
              className="bg-surface rounded-xl border border-line p-5 flex flex-col gap-3 transition-all hover:border-indigo-line hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground leading-snug">{workout.name}</h3>
                {workout.is_template && (
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-soft text-purple-fg border border-purple-line rounded-full">
                    Template
                  </span>
                )}
              </div>

              <div className="flex-1">
                {workout.description && (
                  <p className="text-sm text-muted line-clamp-2">{workout.description}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-elevated text-xs text-subtle font-medium">
                    <Dumbbell size={11} className="text-indigo-500" />
                    {workout.exercise_count} {workout.exercise_count === 1 ? 'exercise' : 'exercises'}
                  </span>
                  {workout.cycle_length && workout.cycle_position && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-indigo-soft text-indigo-fg border border-indigo-line rounded-full px-2 py-0.5 tabular-nums">
                      {workout.cycle_length}-day · day {workout.cycle_position}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <IconButton
                    onClick={() => { setEditingWorkout(workout); setShowBuilder(true) }}
                    aria-label="Edit workout"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton
                    onClick={() => handleDuplicate(workout.id)}
                    aria-label="Duplicate workout"
                    title="Duplicate"
                    disabled={duplicatingId === workout.id}
                  >
                    <Copy size={15} />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    onClick={() => setDeletingId(workout.id)}
                    aria-label="Delete workout"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>

              <Button onClick={() => setAssigningWorkout(workout)} variant="secondary" className="w-full">
                <Send size={14} />
                Assign to client
              </Button>
            </div>
          ))}
        </LibraryFilterableGrid>
      )}
    </div>
  )
}
