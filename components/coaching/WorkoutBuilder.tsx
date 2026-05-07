'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Link2, Dumbbell, HeartPulse, ArrowUpFromLine } from 'lucide-react'
import { ScheduleSection, type ScheduleMode } from './ScheduleSection'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDirtyState } from '@/lib/use-dirty-state'
import { ArrowLeft, Plus, X, Save } from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DragHandle, type DragHandleProps } from '@/components/ui/SortableList'
import { parseDuration, formatDuration } from '@/lib/utils'
import type { DayOfWeek, Exercise, ExerciseSet, ExerciseType, Workout } from '@/lib/types'

// Internal exercise type carrying a stable client-side id for drag-and-drop.
// _dndKey isn't persisted; it just gives every row a sortable identity even
// before it has a real database id.
type DraftExercise = Exercise & { _dndKey: string }
const newDndKey = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`

// Wraps an exercise card with the dnd-kit sortable bindings. Keeps useSortable
// out of the WorkoutBuilder body (where it'd be inside a render callback —
// against the rules of hooks). Children receive drag-handle props to attach
// to the card's grip icon.
function SortableExerciseShell({
  id,
  children,
}: {
  id: string
  children: (drag: DragHandleProps) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  )
}

interface WorkoutBuilderProps {
  coachId: string
  workout: Workout | null
  onClose: () => void
}

const emptySet = (setNumber: number, copyFrom?: ExerciseSet): ExerciseSet => ({
  set_number: setNumber,
  target_reps: copyFrom?.target_reps ?? '',
  target_duration_seconds: copyFrom?.target_duration_seconds ?? null,
  notes: '',
})

// Build initial exercise_sets when an exercise has none yet — derive from
// legacy `sets` count + flat reps so existing workouts keep rendering.
const seedSetsFromLegacy = (ex: Exercise): ExerciseSet[] => {
  const count = Math.max(1, ex.sets ?? 1)
  return Array.from({ length: count }, (_, i) => ({
    set_number: i + 1,
    target_reps: ex.reps ?? '',
    target_duration_seconds: null,
    notes: '',
  }))
}

// While editing a cardio set, the user's text lives in `target_reps` so we
// don't need separate edit-state. On load, hydrate it from the canonical
// `target_duration_seconds` so the input shows a human-friendly value.
const hydrateCardioInputs = (sets: ExerciseSet[]): ExerciseSet[] =>
  sets.map(s => ({
    ...s,
    target_reps:
      s.target_duration_seconds != null && s.target_duration_seconds > 0
        ? formatDuration(s.target_duration_seconds)
        : s.target_reps,
  }))

export default function WorkoutBuilder({ coachId, workout, onClose }: WorkoutBuilderProps) {
  const supabase = useSupabase()
  const [name, setName] = useState(workout?.name || '')
  const [description, setDescription] = useState(workout?.description || '')
  const [isTemplate, setIsTemplate] = useState(workout?.is_template || false)
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(workout?.days_of_week ?? [])
  // Cycle schedule: enabled when both length and position are set; otherwise
  // the workout uses the days_of_week (weekly) schedule.
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    workout?.cycle_length && workout?.cycle_position ? 'cycle' : 'weekly'
  )
  const [cycleLength, setCycleLength] = useState<number>(workout?.cycle_length ?? 8)
  const [cyclePosition, setCyclePosition] = useState<number>(workout?.cycle_position ?? 1)
  const [exercises, setExercises] = useState<DraftExercise[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [snapshotReady, setSnapshotReady] = useState(!workout?.id)

  const isDirty = useDirtyState(
    {
      name,
      description,
      isTemplate,
      daysOfWeek,
      scheduleMode,
      cycleLength,
      cyclePosition,
      exercises,
    },
    snapshotReady
  )

  useEffect(() => {
    if (workout?.id) fetchExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchExercises = async () => {
    if (!workout?.id) return
    try {
      // Pull exercises and per-set rows separately so a problem with one
      // doesn't blank out the whole form.
      const { data: exerciseRows, error: exErr } = await supabase
        .from('exercises')
        .select('*')
        .eq('workout_id', workout.id)
        .order('order_index')

      if (exErr) throw exErr
      const exerciseList = exerciseRows || []
      if (exerciseList.length === 0) {
        setExercises([])
        return
      }

      const ids = exerciseList.map(e => e.id)

      let setsByExercise = new Map<string, ExerciseSet[]>()
      try {
        const { data: setRows } = await supabase
          .from('exercise_sets')
          .select('id, exercise_id, set_number, target_reps, target_duration_seconds, notes')
          .in('exercise_id', ids)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setsByExercise = (setRows || []).reduce((map: Map<string, ExerciseSet[]>, s: any) => {
          const arr = map.get(s.exercise_id) ?? []
          arr.push(s)
          map.set(s.exercise_id, arr)
          return map
        }, new Map<string, ExerciseSet[]>())
      } catch {
        // Fall back to legacy-derived sets if the second query fails.
      }

      // Same defensive split for alternatives — if the table doesn't exist yet
      // (migration pending) the form should still render.
      const altsByExercise = new Map<string, string[]>()
      try {
        const { data: altRows } = await supabase
          .from('exercise_alternatives')
          .select('exercise_id, name, order_index')
          .in('exercise_id', ids)
          .order('order_index', { ascending: true })
        for (const a of (altRows ?? []) as {
          exercise_id: string
          name: string
          order_index: number
        }[]) {
          const arr = altsByExercise.get(a.exercise_id) ?? []
          arr.push(a.name)
          altsByExercise.set(a.exercise_id, arr)
        }
      } catch {
        // Alternatives are optional — silently skip if unavailable.
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalized: DraftExercise[] = exerciseList.map((ex: any) => {
        const sets = (setsByExercise.get(ex.id) ?? [])
          .slice()
          .sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number)
        const baseSets = sets.length > 0 ? sets : seedSetsFromLegacy(ex)
        const type: ExerciseType = ex.exercise_type === 'cardio' ? 'cardio' : 'strength'
        return {
          ...ex,
          exercise_type: type,
          alternatives: altsByExercise.get(ex.id) ?? [],
          exercise_sets: type === 'cardio' ? hydrateCardioInputs(baseSets) : baseSets,
          // Reuse the server id as the DnD key so identity is stable across
          // unrelated state updates.
          _dndKey: ex.id,
        }
      })
      setExercises(normalized)
    } catch {
    } finally {
      setSnapshotReady(true)
    }
  }

  const addExercise = () => {
    setExercises([
      ...exercises,
      {
        name: '',
        exercise_type: 'strength',
        sets: null,
        reps: '',
        weight: '',
        rest_seconds: 60,
        notes: '',
        order_index: exercises.length,
        pair_with_next: false,
        exercise_sets: [emptySet(1)],
        _dndKey: newDndKey(),
      },
    ])
  }

  // dnd-kit sensors: small distance threshold so taps inside the card pass
  // through to inputs/buttons; longer touch delay tolerates scroll gestures.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = exercises.findIndex(ex => ex._dndKey === active.id)
    const newIndex = exercises.findIndex(ex => ex._dndKey === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(exercises, oldIndex, newIndex)
    // Re-sync order_index to match the new positions; everything else
    // (pair_with_next chains, exercise_sets, alternatives) follows the row.
    next.forEach((ex, i) => (ex.order_index = i))
    setExercises(next)
  }

  // Switching type resets the per-set inputs since reps and durations don't translate.
  const setExerciseType = (index: number, type: ExerciseType) => {
    const updated = [...exercises]
    const current = updated[index]
    if (current.exercise_type === type) return
    updated[index] = {
      ...current,
      exercise_type: type,
      // Reset to a single empty set; clear any per-set values from the other type.
      exercise_sets: [emptySet(1)],
      // Cardio rest is naturally 0 (no rest mid-effort); keep coach's existing
      // rest if they had one, otherwise default sensibly per type.
      rest_seconds: current.rest_seconds ?? (type === 'cardio' ? 0 : 60),
    }
    setExercises(updated)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateExercise = (index: number, field: keyof Exercise, value: any) => {
    const updated = [...exercises]
    updated[index] = { ...updated[index], [field]: value }
    setExercises(updated)
  }

  const removeExercise = (index: number) => {
    const updated = exercises.filter((_, i) => i !== index)
    updated.forEach((ex, i) => (ex.order_index = i))
    setExercises(updated)
  }


  const addSet = (exIndex: number) => {
    const updated = [...exercises]
    const sets = updated[exIndex].exercise_sets ?? []
    const last = sets[sets.length - 1]
    updated[exIndex] = {
      ...updated[exIndex],
      exercise_sets: [...sets, emptySet(sets.length + 1, last)],
    }
    setExercises(updated)
  }

  const removeSet = (exIndex: number, setIndex: number) => {
    const updated = [...exercises]
    const sets = (updated[exIndex].exercise_sets ?? [])
      .filter((_, i) => i !== setIndex)
      .map((s, i) => ({ ...s, set_number: i + 1 }))
    updated[exIndex] = { ...updated[exIndex], exercise_sets: sets }
    setExercises(updated)
  }

  const updateSet = (
    exIndex: number,
    setIndex: number,
    field: keyof ExerciseSet,
    value: string
  ) => {
    const updated = [...exercises]
    const sets = [...(updated[exIndex].exercise_sets ?? [])]
    sets[setIndex] = { ...sets[setIndex], [field]: value }
    updated[exIndex] = { ...updated[exIndex], exercise_sets: sets }
    setExercises(updated)
  }

  // Apply set 1's reps to all subsequent sets — handy for "3 × 8".
  const fillSetsFromFirst = (exIndex: number) => {
    const updated = [...exercises]
    const sets = updated[exIndex].exercise_sets ?? []
    if (sets.length < 2) return
    const first = sets[0]
    updated[exIndex] = {
      ...updated[exIndex],
      exercise_sets: sets.map((s, i) => (i === 0 ? s : { ...s, target_reps: first.target_reps })),
    }
    setExercises(updated)
  }

  const addAlternative = (exIndex: number) => {
    const updated = [...exercises]
    const current = updated[exIndex].alternatives ?? []
    updated[exIndex] = { ...updated[exIndex], alternatives: [...current, ''] }
    setExercises(updated)
  }

  const updateAlternative = (exIndex: number, altIndex: number, value: string) => {
    const updated = [...exercises]
    const current = [...(updated[exIndex].alternatives ?? [])]
    current[altIndex] = value
    updated[exIndex] = { ...updated[exIndex], alternatives: current }
    setExercises(updated)
  }

  const removeAlternative = (exIndex: number, altIndex: number) => {
    const updated = [...exercises]
    const current = (updated[exIndex].alternatives ?? []).filter((_, i) => i !== altIndex)
    updated[exIndex] = { ...updated[exIndex], alternatives: current }
    setExercises(updated)
  }

  // Swap the alternative at `altIndex` with the main exercise name. Old main
  // takes the alternative's slot. This is purely a form-state edit; the
  // promotion-aware history backfill happens at save time when we can compare
  // against the server's prior name.
  const promoteAlternative = (exIndex: number, altIndex: number) => {
    const updated = [...exercises]
    const ex = updated[exIndex]
    const alts = [...(ex.alternatives ?? [])]
    const promoted = alts[altIndex]?.trim()
    if (!promoted) return
    const oldMain = ex.name
    alts[altIndex] = oldMain
    updated[exIndex] = { ...ex, name: promoted, alternatives: alts }
    setExercises(updated)
  }

  // Intercept close attempts so unsaved edits aren't silently dropped.
  const requestClose = () => {
    if (isDirty && !saving) setConfirmDiscard(true)
    else onClose()
  }

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Please enter a workout name', 'error')
      return
    }

    setSaving(true)
    try {
      let workoutId = workout?.id

      // Only write the schedule columns belonging to the active mode; the
      // others are nulled so a stale value can't haunt a switched-modes workout.
      const isCycle = scheduleMode === 'cycle'
      const sanitizedLength = Math.max(1, Math.min(60, Math.floor(cycleLength) || 1))
      const sanitizedPosition = Math.max(1, Math.min(sanitizedLength, Math.floor(cyclePosition) || 1))
      const schedulePayload = isCycle
        ? {
            days_of_week: [],
            cycle_length: sanitizedLength,
            cycle_position: sanitizedPosition,
          }
        : {
            days_of_week: daysOfWeek,
            cycle_length: null,
            cycle_position: null,
          }

      if (workoutId) {
        const { error } = await supabase
          .from('workouts')
          .update({
            name,
            description,
            is_template: isTemplate,
            ...schedulePayload,
          })
          .eq('id', workoutId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('workouts')
          .insert({
            coach_id: coachId,
            name,
            description,
            is_template: isTemplate,
            ...schedulePayload,
          })
          .select()
          .single()
        if (error) throw error
        workoutId = data.id
      }

      // ── Diff-based exercise sync ───────────────────────────────────────────
      // Goal: preserve exercise IDs across edits so client-owned data
      // (set_logs, exercise_substitutions) keyed on exercise_id stays valid.
      // Only exercises the coach explicitly removed get deleted; everything
      // else is updated in place.
      const exerciseFields = (ex: Exercise, formIndex: number) => ({
        name: ex.name,
        exercise_type: ex.exercise_type ?? 'strength',
        sets: ex.exercise_sets?.length ?? null,
        reps: ex.exercise_sets?.[0]?.target_reps ?? ex.reps ?? '',
        weight: '',
        rest_seconds: ex.rest_seconds,
        notes: ex.notes,
        order_index: formIndex,
        // Last exercise can't pair with anything.
        pair_with_next: formIndex < exercises.length - 1 ? !!ex.pair_with_next : false,
      })

      // 1) Find what the server has now, so we can compute the delta. Also
      // pull `name` so we can detect "promoted alternative" swaps later — the
      // alternatives need to come from a separate query since they live in a
      // child table.
      const serverIds = new Set<string>()
      const serverNameById = new Map<string, string>()
      const serverAltsById = new Map<string, string[]>()
      if (workout?.id) {
        const { data: existing } = await supabase
          .from('exercises')
          .select('id, name')
          .eq('workout_id', workoutId)
        for (const r of (existing ?? []) as { id: string; name: string }[]) {
          serverIds.add(r.id)
          serverNameById.set(r.id, r.name)
        }
        if (serverIds.size > 0) {
          try {
            const { data: altRows } = await supabase
              .from('exercise_alternatives')
              .select('exercise_id, name, order_index')
              .in('exercise_id', Array.from(serverIds))
              .order('order_index', { ascending: true })
            for (const a of (altRows ?? []) as {
              exercise_id: string
              name: string
            }[]) {
              const arr = serverAltsById.get(a.exercise_id) ?? []
              arr.push(a.name)
              serverAltsById.set(a.exercise_id, arr)
            }
          } catch {
            // Alternatives table may not exist on older deployments.
          }
        }
      }

      const formIdSet = new Set(
        exercises.map(ex => ex.id).filter((id): id is string => !!id)
      )

      // 2) Delete exercises the coach removed from the form. CASCADE here is
      // intentional — set_logs / exercise_substitutions for these rows go too.
      const toDeleteIds = Array.from(serverIds).filter(id => !formIdSet.has(id))
      if (toDeleteIds.length > 0) {
        const { error } = await supabase.from('exercises').delete().in('id', toDeleteIds)
        if (error) throw error
      }

      // 2.5) Detect promotions and rewrite history so progressive-overload
      // comparisons stay variant-aware.
      //
      // A "promotion" means the form's main name was previously an alternative
      // on the server, AND the previous main name is now in the form's
      // alternatives list. When that happens:
      //   - Past dates with set_logs but no substitution row were performed on
      //     the OLD main → backfill substitutions naming the old main, so
      //     they're correctly variant-tagged after the rename.
      //   - Past substitutions that named the NEW main are no longer swaps
      //     (that's now the default) → delete those rows.
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i]
        if (!ex.id || !serverIds.has(ex.id)) continue

        const oldMain = serverNameById.get(ex.id)
        if (!oldMain || oldMain === ex.name) continue

        const oldAlts = serverAltsById.get(ex.id) ?? []
        const newMain = ex.name
        const newAlts = ex.alternatives ?? []
        const isPromotion =
          oldAlts.includes(newMain) && newAlts.includes(oldMain)
        if (!isPromotion) continue

        try {
          // Each set_log row carries (assignment_id, logged_date). The
          // workout might be assigned to several clients, and each
          // (assignment_id, logged_date) pair needs its own substitution row
          // since exercise_substitutions is keyed per-assignment.
          const { data: logRows } = await supabase
            .from('set_logs')
            .select('assignment_id, logged_date')
            .eq('exercise_id', ex.id)
          const pairs = Array.from(
            new Set(
              (logRows ?? []).map(
                (r: { assignment_id: string; logged_date: string }) =>
                  `${r.assignment_id}::${r.logged_date}`
              )
            )
          ).map(s => {
            const [assignment_id, logged_date] = s.split('::')
            return { assignment_id, logged_date }
          })

          if (pairs.length > 0) {
            // Pre-existing substitution rows for any of these pairs — we
            // don't want to clobber a real swap.
            const { data: subRows } = await supabase
              .from('exercise_substitutions')
              .select('assignment_id, logged_date')
              .eq('exercise_id', ex.id)
              .in('assignment_id', Array.from(new Set(pairs.map(p => p.assignment_id))))
            const subbed = new Set(
              (subRows ?? []).map(
                (r: { assignment_id: string; logged_date: string }) =>
                  `${r.assignment_id}::${r.logged_date}`
              )
            )

            // Pairs with logs and no substitution row = the trainee did the
            // OLD main on those days. Tag retroactively.
            const toBackfill = pairs.filter(
              p => !subbed.has(`${p.assignment_id}::${p.logged_date}`)
            )
            if (toBackfill.length > 0) {
              await supabase.from('exercise_substitutions').insert(
                toBackfill.map(p => ({
                  assignment_id: p.assignment_id,
                  exercise_id: ex.id,
                  logged_date: p.logged_date,
                  substituted_name: oldMain,
                }))
              )
            }
          }
        } catch {
          // Backfill is best-effort — never block the promotion itself on
          // a substitutions-table error.
        }
      }

      // 2.6) For every promoted exercise, drop substitutions whose name
      // matches the new main — they're no longer swaps. Done as a separate
      // pass so we don't delete what we just inserted in step 2.5.
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i]
        if (!ex.id || !serverIds.has(ex.id)) continue
        const oldMain = serverNameById.get(ex.id)
        if (!oldMain || oldMain === ex.name) continue
        const oldAlts = serverAltsById.get(ex.id) ?? []
        const newAlts = ex.alternatives ?? []
        if (!(oldAlts.includes(ex.name) && newAlts.includes(oldMain))) continue

        try {
          await supabase
            .from('exercise_substitutions')
            .delete()
            .eq('exercise_id', ex.id)
            .eq('substituted_name', ex.name)
        } catch {
          // best-effort
        }
      }

      // 3) Update exercises that survived (preserves exercise_id → keeps logs).
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i]
        if (!ex.id || !serverIds.has(ex.id)) continue
        const { error } = await supabase
          .from('exercises')
          .update(exerciseFields(ex, i))
          .eq('id', ex.id)
        if (error) throw error
      }

      // 4) Insert newly added exercises in one batch and capture their ids.
      // We use the form's order_index (unique within the form) to map the
      // returned rows back to the corresponding form entries.
      const newRows = exercises
        .map((ex, i) => ({ ex, i }))
        .filter(({ ex }) => !ex.id || !serverIds.has(ex.id))
      const insertedIdByOrderIndex = new Map<number, string>()
      if (newRows.length > 0) {
        const { data: inserted, error } = await supabase
          .from('exercises')
          .insert(
            newRows.map(({ ex, i }) => ({ workout_id: workoutId, ...exerciseFields(ex, i) }))
          )
          .select('id, order_index')
        if (error) throw error
        for (const r of (inserted ?? []) as { id: string; order_index: number }[]) {
          insertedIdByOrderIndex.set(r.order_index, r.id)
        }
      }

      // Final exercise_id per form entry.
      const exerciseIdAt = (formIndex: number): string => {
        const ex = exercises[formIndex]
        if (ex.id && serverIds.has(ex.id)) return ex.id
        const fresh = insertedIdByOrderIndex.get(formIndex)
        if (!fresh) {
          // Should never happen — the insert above covers every new form row.
          throw new Error('Missing inserted id for new exercise')
        }
        return fresh
      }
      const allExerciseIds = exercises.map((_, i) => exerciseIdAt(i))

      // 5) Replace exercise_sets and exercise_alternatives for every surviving
      // exercise. set_logs reference exercise_id (not exercise_sets.id), and
      // exercise_substitutions reference exercise_id (not exercise_alternatives.id),
      // so wiping these child rows does NOT touch client logs.
      if (allExerciseIds.length > 0) {
        const { error: setDelErr } = await supabase
          .from('exercise_sets')
          .delete()
          .in('exercise_id', allExerciseIds)
        if (setDelErr) throw setDelErr
        // Alternatives table may not exist yet on older deployments.
        try {
          await supabase
            .from('exercise_alternatives')
            .delete()
            .in('exercise_id', allExerciseIds)
        } catch {
          // best-effort
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setsToInsert: any[] = []
      exercises.forEach((ex, i) => {
        const exId = allExerciseIds[i]
        const isCardio = ex.exercise_type === 'cardio'
        ;(ex.exercise_sets ?? []).forEach(s => {
          const durationSeconds = isCardio ? parseDuration(s.target_reps) : null
          setsToInsert.push({
            exercise_id: exId,
            set_number: s.set_number,
            target_reps: isCardio ? '' : s.target_reps,
            target_duration_seconds: durationSeconds,
            notes: s.notes,
          })
        })
      })
      if (setsToInsert.length > 0) {
        const { error } = await supabase.from('exercise_sets').insert(setsToInsert)
        if (error) throw error
      }

      const altsToInsert: { exercise_id: string; name: string; order_index: number }[] = []
      exercises.forEach((ex, i) => {
        const exId = allExerciseIds[i]
        ;(ex.alternatives ?? [])
          .map(n => n.trim())
          .filter(n => n.length > 0)
          .forEach((name, j) => {
            altsToInsert.push({ exercise_id: exId, name, order_index: j })
          })
      })
      if (altsToInsert.length > 0) {
        // Best-effort — if the alternatives table doesn't exist on this
        // deployment yet, the rest of the save still succeeded.
        await supabase.from('exercise_alternatives').insert(altsToInsert)
      }

      onClose()
    } catch {
      showToast('Failed to save workout', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <IconButton onClick={requestClose} aria-label="Go back">
          <ArrowLeft size={18} />
        </IconButton>
        <h2 className="text-xl font-bold text-slate-900">
          {workout ? 'Edit Workout' : 'Create Workout'}
        </h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 space-y-4">
        <Field id="wb-name" label="Workout Name">
          <Input
            id="wb-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Full Body Strength"
          />
        </Field>

        <Field id="wb-desc" label="Description" optional>
          <Textarea
            id="wb-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Brief description of this workout..."
            rows={2}
          />
        </Field>

        <ScheduleSection
          scheduleMode={scheduleMode}
          setScheduleMode={setScheduleMode}
          daysOfWeek={daysOfWeek}
          setDaysOfWeek={setDaysOfWeek}
          cycleLength={cycleLength}
          setCycleLength={setCycleLength}
          cyclePosition={cyclePosition}
          setCyclePosition={setCyclePosition}
        />

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={e => setIsTemplate(e.target.checked)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
          />
          <span className="text-sm text-slate-700">Save as template</span>
        </label>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Exercises</h3>
        <Button variant="success" size="sm" onClick={addExercise}>
          <Plus size={14} />
          Add Exercise
        </Button>
      </div>

      {exercises.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-8 text-center">
          <p className="text-slate-400 text-sm">No exercises yet. Add your first exercise above.</p>
        </div>
      ) : (
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext
            items={exercises.map(ex => ex._dndKey)}
            strategy={verticalListSortingStrategy}
          >
        <div className="space-y-3">
          {(() => {
            // Group consecutive paired exercises so the visual frame matches the data.
            type ExerciseGroup = { startIndex: number; exercises: DraftExercise[] }
            const groups: ExerciseGroup[] = []
            exercises.forEach((ex, i) => {
              const prev = exercises[i - 1]
              const continueGroup = !!prev?.pair_with_next
              const last = groups[groups.length - 1]
              if (continueGroup && last) last.exercises.push(ex)
              else groups.push({ startIndex: i, exercises: [ex] })
            })

            const renderCard = (
              exercise: DraftExercise,
              index: number,
              drag: DragHandleProps
            ) => {
              const sets = exercise.exercise_sets ?? []
              const type: ExerciseType = exercise.exercise_type ?? 'strength'
              const isCardio = type === 'cardio'
              return (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex justify-between items-center mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <DragHandle {...drag} />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Exercise {index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton tone="danger" onClick={() => removeExercise(index)} aria-label="Remove exercise">
                      <X size={16} />
                    </IconButton>
                  </div>
                </div>

                {/* Type toggle: Strength vs Cardio */}
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 mb-3 bg-slate-50">
                  {([
                    { value: 'strength' as const, label: 'Strength', Icon: Dumbbell },
                    { value: 'cardio' as const, label: 'Cardio', Icon: HeartPulse },
                  ]).map(({ value, label, Icon }) => {
                    const active = type === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setExerciseType(index, value)}
                        aria-pressed={active}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? value === 'cardio'
                              ? 'bg-amber-500 text-white'
                              : 'bg-indigo-600 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Icon size={13} />
                        {label}
                      </button>
                    )
                  })}
                </div>

                <Input
                  value={exercise.name}
                  onChange={e => updateExercise(index, 'name', e.target.value)}
                  placeholder={isCardio ? 'Cardio name (e.g., Treadmill, Cycling)' : 'Exercise name (e.g., Barbell Squat)'}
                  className="mb-3"
                />

                {/* Per-set table */}
                <div className="bg-slate-50 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      {isCardio ? (sets.length > 1 ? 'Intervals' : 'Duration') : 'Sets'}
                    </span>
                    <div className="flex items-center gap-2">
                      {sets.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => fillSetsFromFirst(index)}
                          className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                        >
                          {isCardio ? 'Copy interval 1 to all' : 'Copy set 1 to all'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => addSet(index)}
                        className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        {isCardio ? '+ Add interval' : '+ Add set'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 px-1">
                    <div className="col-span-2">{isCardio ? '#' : 'Set'}</div>
                    <div className="col-span-9">{isCardio ? 'Target time' : 'Reps'}</div>
                    <div className="col-span-1" />
                  </div>

                  {sets.length === 0 ? (
                    <p className="text-xs text-slate-400 italic px-1 py-2">
                      {isCardio
                        ? 'No duration set. Click "+ Add interval" to add one.'
                        : 'No sets yet. Click "+ Add set" to add one.'}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {sets.map((s, setIndex) => {
                        const parsedSeconds = isCardio ? parseDuration(s.target_reps) : null
                        const showHint =
                          isCardio &&
                          s.target_reps.trim() !== '' &&
                          parsedSeconds != null &&
                          formatDuration(parsedSeconds) !== s.target_reps.trim()
                        return (
                          <div key={setIndex} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-2 text-sm font-medium text-slate-500 text-center">
                              {s.set_number}
                            </div>
                            <div className="col-span-9">
                              <Input
                                value={s.target_reps}
                                onChange={e => updateSet(index, setIndex, 'target_reps', e.target.value)}
                                placeholder={isCardio ? '20:30 or 30 (min)' : '8 or 6-10 or AMRAP'}
                                className="text-sm"
                              />
                              {showHint && (
                                <p className="text-[10px] text-slate-400 mt-0.5 px-1">
                                  = {formatDuration(parsedSeconds)}
                                </p>
                              )}
                              {isCardio &&
                                s.target_reps.trim() !== '' &&
                                parsedSeconds == null && (
                                  <p className="text-[10px] text-amber-600 mt-0.5 px-1">
                                    Couldn&rsquo;t parse — try &ldquo;20&rdquo;, &ldquo;20:30&rdquo;, or &ldquo;1h 20m&rdquo;
                                  </p>
                                )}
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <IconButton
                                tone="danger"
                                onClick={() => removeSet(index, setIndex)}
                                aria-label={isCardio ? 'Remove interval' : 'Remove set'}
                                disabled={sets.length === 1}
                              >
                                <X size={14} />
                              </IconButton>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      {isCardio && sets.length > 1 ? 'Rest between intervals (s)' : 'Rest (seconds)'}
                    </label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={exercise.rest_seconds ?? ''}
                      onChange={e => updateExercise(index, 'rest_seconds', e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder={isCardio ? '0' : '60'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Notes</label>
                    <Input
                      value={exercise.notes}
                      onChange={e => updateExercise(index, 'notes', e.target.value)}
                      placeholder={isCardio ? 'Pace, incline, RPE, etc.' : 'Form cues, tempo, etc.'}
                    />
                  </div>
                </div>

                {/* Alternatives — fallback exercise names the trainee can swap to
                    when the prescribed equipment isn't available. */}
                <div className="mt-3 bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      Alternatives
                    </span>
                    <button
                      type="button"
                      onClick={() => addAlternative(index)}
                      className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      + Add alternative
                    </button>
                  </div>
                  {(exercise.alternatives ?? []).length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic px-1 py-1">
                      None yet. Add fallbacks like &ldquo;Goblet Squat&rdquo; or &ldquo;Leg Press&rdquo;
                      so clients can swap if the equipment isn&rsquo;t available.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {(exercise.alternatives ?? []).map((alt, altIndex) => (
                        <div key={altIndex} className="flex items-center gap-2">
                          <Input
                            value={alt}
                            onChange={e => updateAlternative(index, altIndex, e.target.value)}
                            placeholder="e.g., Goblet Squat"
                            className="text-sm flex-1"
                          />
                          <IconButton
                            onClick={() => promoteAlternative(index, altIndex)}
                            disabled={!alt.trim()}
                            aria-label="Make this the main exercise"
                            title="Make this the main exercise"
                          >
                            <ArrowUpFromLine size={14} />
                          </IconButton>
                          <IconButton
                            tone="danger"
                            onClick={() => removeAlternative(index, altIndex)}
                            aria-label="Remove alternative"
                          >
                            <X size={14} />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* "Pair with next" toggle — only meaningful if there's a next exercise */}
                {index < exercises.length - 1 && (
                  <button
                    type="button"
                    onClick={() => updateExercise(index, 'pair_with_next', !exercise.pair_with_next)}
                    aria-pressed={!!exercise.pair_with_next}
                    className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                      exercise.pair_with_next
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Link2 size={14} />
                    {exercise.pair_with_next
                      ? 'Paired with next exercise (in superset)'
                      : 'Pair with next exercise'}
                  </button>
                )}
              </div>
              )
            }

            return groups.map((group, gi) => {
              if (group.exercises.length === 1) {
                const ex = group.exercises[0]
                return (
                  <SortableExerciseShell key={ex._dndKey} id={ex._dndKey}>
                    {drag => renderCard(ex, group.startIndex, drag)}
                  </SortableExerciseShell>
                )
              }
              return (
                <div
                  key={`group-${gi}`}
                  className="rounded-2xl border-2 border-indigo-300 bg-indigo-50/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-3 px-1 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white bg-indigo-600 rounded-full px-2.5 py-1">
                      Superset
                    </span>
                    <span className="text-[10px] text-indigo-700 font-medium">
                      {group.exercises.length} exercises &middot; performed back-to-back
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.exercises.map((ex, j) => (
                      <SortableExerciseShell key={ex._dndKey} id={ex._dndKey}>
                        {drag => renderCard(ex, group.startIndex + j, drag)}
                      </SortableExerciseShell>
                    ))}
                  </div>
                </div>
              )
            })
          })()}
        </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Bottom "Add exercise" — saves the coach a long scroll back to the
          top button after appending a card. Hidden in the empty state since
          the dashed empty card already prompts the action. */}
      {exercises.length > 0 && (
        <button
          type="button"
          onClick={addExercise}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/40 transition-colors cursor-pointer text-sm font-medium"
        >
          <Plus size={16} />
          Add Exercise
        </button>
      )}

      {/* Spacer so the sticky bar never covers the last card */}
      <div className="h-24" aria-hidden />

      {/* Floating action bar — persistent save target on long forms (esp. mobile). */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-8 mt-6 z-20 px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-6px_20px_-8px_rgba(15,23,42,0.12)] flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span className="tabular-nums">
            <span className="font-semibold text-slate-700">{exercises.length}</span>{' '}
            {exercises.length === 1 ? 'exercise' : 'exercises'}
          </span>
          <UnsavedBadge visible={isDirty && !saving} />
        </div>
        <div className="sm:hidden">
          <UnsavedBadge visible={isDirty && !saving} />
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={requestClose} disabled={saving} size="sm">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty}
          size="sm"
        >
          {!saving && <Save size={14} />}
          {saving ? 'Saving…' : 'Save Workout'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved edits to this workout. They'll be lost if you leave now."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
