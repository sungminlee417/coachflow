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
import { stripMeta, mapByOrderIndex } from '@/lib/copy-utils'
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
      // Invalidate caches so open views (Today, ClientWorkoutView) don't render stale assignments.
      await Promise.all([fetchWorkouts(), invalidateWorkouts({ coachId })])
      showToast('Workout deleted')
    } catch {
      showToast('Failed to delete workout', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDuplicate = async (workoutId: string) => {
    setDuplicatingId(workoutId)
    try {
      const { data: src } = await supabase.from('workouts').select('*').eq('id', workoutId).maybeSingle()
      if (!src) throw new Error('Source not found')

      const { data: workout, error: insertErr } = await supabase
        .from('workouts')
        .insert({ ...stripMeta(src), name: `${src.name} (copy)`, coach_id: coachId })
        .select('id')
        .single()
      if (insertErr || !workout) throw insertErr ?? new Error('Insert failed')

      const { data: exercises } = await supabase
        .from('exercises').select('*').eq('workout_id', workoutId).order('order_index')

      if (exercises?.length) {
        const oldIds = exercises.map(e => e.id as string)
        const { data: newExercises, error: exErr } = await supabase
          .from('exercises')
          .insert(exercises.map(e => ({ ...stripMeta(e), workout_id: workout.id })))
          .select('id, order_index')
        if (exErr) throw exErr

        const exerciseIdMap = mapByOrderIndex(
          exercises as Array<{ id: string; order_index: number }>,
          (newExercises ?? []) as Array<{ id: string; order_index: number }>
        )

        const { data: sets } = await supabase.from('exercise_sets').select('*').in('exercise_id', oldIds)
        const setsPayload = (sets ?? []).flatMap(s => {
          const newId = exerciseIdMap.get(s.exercise_id as string)
          return newId ? [{ ...stripMeta(s), exercise_id: newId }] : []
        })
        if (setsPayload.length) await supabase.from('exercise_sets').insert(setsPayload)

        try {
          const { data: alts } = await supabase.from('exercise_alternatives').select('*').in('exercise_id', oldIds)
          const altsPayload = (alts ?? []).flatMap(a => {
            const newId = exerciseIdMap.get(a.exercise_id as string)
            return newId ? [{ ...stripMeta(a), exercise_id: newId }] : []
          })
          if (altsPayload.length) await supabase.from('exercise_alternatives').insert(altsPayload)
        } catch { /* exercise_alternatives may be absent on older deploys */ }
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
