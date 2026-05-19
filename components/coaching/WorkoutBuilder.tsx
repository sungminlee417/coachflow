'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { ExerciseNameInput } from '@/components/ui/ExerciseNameInput'
import { Link2, Dumbbell, HeartPulse, ArrowUpFromLine, Plus, X } from 'lucide-react'
import { ScheduleSection, type ScheduleMode } from './ScheduleSection'
import { BuilderHeader } from '@/components/ui/BuilderHeader'
import { BuilderSaveBar } from '@/components/ui/BuilderSaveBar'
import { BuilderCard } from '@/components/ui/BuilderCard'
import { EmptyStateCard } from '@/components/ui/EmptyStateCard'
import { DiscardDialog } from '@/components/ui/DiscardDialog'
import { AddItemButton } from '@/components/ui/AddItemButton'
import { AddFab } from '@/components/ui/AddFab'
import { useDirtyState } from '@/lib/use-dirty-state'
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
import {
  CARDIO_SUBTYPES,
  CARDIO_LABELS,
  getCardioFields,
  type CardioSubtype,
} from '@/lib/cardio'
import type { DayOfWeek, Exercise, ExerciseSet, ExerciseType, Workout } from '@/lib/types'
import {
  loadWorkoutExercises,
  saveWorkout,
  type DraftExercise,
} from './workout/persistence'
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
  // Cardio extras carry forward when adding a new interval so "add interval"
  // feels like duplication, not a blank slate.
  target_speed: copyFrom?.target_speed ?? null,
  target_incline: copyFrom?.target_incline ?? null,
  target_resistance: copyFrom?.target_resistance ?? null,
})

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

  // Pre-compute superset groupings off the exercise list. Recomputed only
  // when exercises change — otherwise unrelated re-renders (saving toggle,
  // form field edits) would rebuild the array on every keystroke.
  const exerciseGroups = useMemo(() => {
    type ExerciseGroup = { startIndex: number; exercises: DraftExercise[] }
    const groups: ExerciseGroup[] = []
    exercises.forEach((ex, i) => {
      const prev = exercises[i - 1]
      const continueGroup = !!prev?.pair_with_next
      const last = groups[groups.length - 1]
      if (continueGroup && last) last.exercises.push(ex)
      else groups.push({ startIndex: i, exercises: [ex] })
    })
    return groups
  }, [exercises])

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
      const loaded = await loadWorkoutExercises(supabase, workout.id)
      setExercises(loaded)
    } catch {
      // Empty form — coach can still add new exercises.
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
      await saveWorkout(supabase, {
        coachId,
        existingWorkoutId: workout?.id,
        name,
        description,
        isTemplate,
        scheduleMode,
        cycleLength,
        cyclePosition,
        daysOfWeek,
        exercises,
      })
      onClose()
    } catch {
      showToast('Failed to save workout', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <BuilderHeader
        title={workout ? 'Edit Workout' : 'Create Workout'}
        onBack={requestClose}
      />

      <BuilderCard>
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
            className="h-4 w-4 text-indigo-fg focus:ring-indigo-500 border-line rounded cursor-pointer"
          />
          <span className="text-sm text-foreground">Save as template</span>
        </label>
      </BuilderCard>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">Exercises</h3>
        <Button variant="success" size="sm" onClick={addExercise}>
          <Plus size={14} />
          Add Exercise
        </Button>
      </div>

      {exercises.length === 0 ? (
        <EmptyStateCard message="No exercises yet. Add your first exercise above." />
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
            const groups = exerciseGroups

            const renderCard = (
              exercise: DraftExercise,
              index: number,
              drag: DragHandleProps
            ) => {
              const sets = exercise.exercise_sets ?? []
              const type: ExerciseType = exercise.exercise_type ?? 'strength'
              const isCardio = type === 'cardio'
              return (
              <div className="bg-surface rounded-xl border border-line p-4">
                <div className="flex justify-between items-center mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <DragHandle {...drag} />
                    <span className="text-xs font-semibold text-subtle uppercase tracking-wide">
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
                <div className="inline-flex rounded-lg border border-line p-0.5 mb-3 bg-elevated">
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
 : 'text-muted hover:text-foreground '
 }`}
                      >
                        <Icon size={13} />
                        {label}
                      </button>
                    )
                  })}
                </div>

                <div className="mb-3">
                  <ExerciseNameInput
                    value={exercise.name}
                    onChange={(name, catalogId) => {
                      // Both fields in one setState — two sequential
                      // `updateExercise` calls would race on the same
                      // `exercises` snapshot and the second would clobber
                      // the first.
                      setExercises(prev => {
                        const updated = [...prev]
                        updated[index] = {
                          ...updated[index],
                          name,
                          catalog_id: catalogId,
                        }
                        return updated
                      })
                    }}
                    placeholder={isCardio ? 'Cardio name (e.g., Treadmill, Cycling)' : 'Exercise name (e.g., Barbell Squat)'}
                  />
                </div>

                {/* Cardio machine picker — drives which extra prescription
                    fields appear under each interval below. */}
                {isCardio && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5">
                      Machine
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CARDIO_SUBTYPES.map(sub => {
                        const active = exercise.cardio_subtype === sub
                        return (
                          <button
                            key={sub}
                            type="button"
                            onClick={() =>
                              updateExercise(
                                index,
                                'cardio_subtype',
                                active ? null : sub
                              )
                            }
                            aria-pressed={active}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
 active
 ? 'bg-amber-500 text-white border-amber-500'
 : 'border-line text-muted hover:border-amber-300 hover:text-amber-fg hover:bg-amber-50/40'
 }`}
                          >
                            {CARDIO_LABELS[sub]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Per-set table */}
                <div className="bg-elevated rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {isCardio ? (sets.length > 1 ? 'Intervals' : 'Duration') : 'Sets'}
                    </span>
                    <div className="flex items-center gap-2">
                      {sets.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => fillSetsFromFirst(index)}
                          className="text-[10px] font-medium text-indigo-fg hover:text-indigo-fg-strong cursor-pointer"
                        >
                          {isCardio ? 'Copy interval 1 to all' : 'Copy set 1 to all'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => addSet(index)}
                        className="text-[10px] font-medium text-indigo-fg hover:text-indigo-fg-strong cursor-pointer"
                      >
                        {isCardio ? '+ Add interval' : '+ Add set'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-subtle mb-1 px-1">
                    <div className="col-span-2">{isCardio ? '#' : 'Set'}</div>
                    <div className="col-span-8">{isCardio ? 'Target time' : 'Reps'}</div>
                    <div className="col-span-2" />
                  </div>

                  {sets.length === 0 ? (
                    <p className="text-xs text-subtle italic px-1 py-2">
                      {isCardio
                        ? 'No duration set. Click "+ Add interval" to add one.'
                        : 'No sets yet. Click "+ Add set" to add one.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {sets.map((s, setIndex) => {
                        const parsedSeconds = isCardio ? parseDuration(s.target_reps) : null
                        const showHint =
                          isCardio &&
                          s.target_reps.trim() !== '' &&
                          parsedSeconds != null &&
                          formatDuration(parsedSeconds) !== s.target_reps.trim()
                        const cardioFields = isCardio
                          ? getCardioFields(exercise.cardio_subtype as CardioSubtype | null)
                          : null
                        const showCardioRow =
                          !!cardioFields &&
                          (cardioFields.speed || cardioFields.incline || cardioFields.resistance)
                        return (
                          <div key={setIndex}>
                            <div className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-2 text-sm font-medium text-muted text-center">
                                {s.set_number}
                              </div>
                              <div className="col-span-8">
                                <Input
                                  value={s.target_reps}
                                  onChange={e => updateSet(index, setIndex, 'target_reps', e.target.value)}
                                  placeholder={isCardio ? '20:30 or 30 (min)' : '8 or 6-10 or AMRAP'}
                                  className="text-sm"
                                />
                                {showHint && (
                                  <p className="text-[10px] text-subtle mt-0.5 px-1">
                                    = {formatDuration(parsedSeconds)}
                                  </p>
                                )}
                                {isCardio &&
                                  s.target_reps.trim() !== '' &&
                                  parsedSeconds == null && (
                                    <p className="text-[10px] text-amber-fg mt-0.5 px-1">
                                      Couldn&rsquo;t parse — try &ldquo;20&rdquo;, &ldquo;20:30&rdquo;, or &ldquo;1h 20m&rdquo;
                                    </p>
                                  )}
                              </div>
                              <div className="col-span-2 flex justify-end">
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
                            {showCardioRow && cardioFields && (
                              <div className="grid grid-cols-12 gap-2 mt-1.5">
                                {/* Empty leading column lines the cardio fields
                                    up under the duration input above. */}
                                <div className="col-span-2" />
                                <div className="col-span-8 grid grid-cols-3 gap-2">
                                  {cardioFields.speed && (
                                    <div>
                                      <label className="block text-[10px] text-muted mb-0.5">Speed</label>
                                      <Input
                                        value={s.target_speed ?? ''}
                                        onChange={e =>
                                          updateSet(index, setIndex, 'target_speed', e.target.value)
                                        }
                                        placeholder="3-4"
                                        className="text-sm py-1.5"
                                      />
                                    </div>
                                  )}
                                  {cardioFields.incline && (
                                    <div>
                                      <label className="block text-[10px] text-muted mb-0.5">Incline %</label>
                                      <Input
                                        value={s.target_incline ?? ''}
                                        onChange={e =>
                                          updateSet(index, setIndex, 'target_incline', e.target.value)
                                        }
                                        placeholder="15"
                                        className="text-sm py-1.5"
                                      />
                                    </div>
                                  )}
                                  {cardioFields.resistance && (
                                    <div>
                                      <label className="block text-[10px] text-muted mb-0.5">Resistance</label>
                                      <Input
                                        value={s.target_resistance ?? ''}
                                        onChange={e =>
                                          updateSet(index, setIndex, 'target_resistance', e.target.value)
                                        }
                                        placeholder="8"
                                        className="text-sm py-1.5"
                                      />
                                    </div>
                                  )}
                                </div>
                                <div className="col-span-2" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">
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
                    <label className="block text-xs text-muted mb-1">Notes</label>
                    <Input
                      value={exercise.notes}
                      onChange={e => updateExercise(index, 'notes', e.target.value)}
                      placeholder={isCardio ? 'Pace, incline, RPE, etc.' : 'Form cues, tempo, etc.'}
                    />
                  </div>
                </div>

                {/* Alternatives — fallback exercise names the trainee can swap to
                    when the prescribed equipment isn't available. */}
                <div className="mt-3 bg-elevated rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      Alternatives
                    </span>
                    <button
                      type="button"
                      onClick={() => addAlternative(index)}
                      className="text-[10px] font-medium text-indigo-fg hover:text-indigo-fg-strong cursor-pointer"
                    >
                      + Add alternative
                    </button>
                  </div>
                  {(exercise.alternatives ?? []).length === 0 ? (
                    <p className="text-[11px] text-subtle italic px-1 py-1">
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
 ? 'bg-indigo-soft text-indigo-fg border-indigo-line hover:bg-indigo-strong '
 : 'bg-elevated text-muted border-line hover:bg-elevated '
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
                    <span className="text-[10px] text-indigo-fg font-medium">
                      {`${group.exercises.length} exercises · performed back-to-back`}
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

      {exercises.length > 0 && (
        <AddItemButton label="Add Exercise" onClick={addExercise} />
      )}
      {exercises.length > 0 && <AddFab ariaLabel="Add exercise" onClick={addExercise} />}

      <BuilderSaveBar
        count={exercises.length}
        noun="exercise"
        isDirty={isDirty}
        saving={saving}
        onCancel={requestClose}
        onSave={handleSave}
        saveLabel="Save Workout"
      />

      <DiscardDialog
        open={confirmDiscard}
        noun="workout"
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
