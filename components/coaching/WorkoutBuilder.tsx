'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Link2, Dumbbell, HeartPulse } from 'lucide-react'
import { DayOfWeekSelector } from '@/components/ui/DayOfWeekSelector'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { useDirtyState } from '@/lib/use-dirty-state'
import { ArrowLeft, Plus, X, ChevronUp, ChevronDown, Save } from 'lucide-react'
import { parseDuration, formatDuration } from '@/lib/utils'
import type { DayOfWeek, Exercise, ExerciseSet, ExerciseType, Workout } from '@/lib/types'

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
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [saving, setSaving] = useState(false)
  const [snapshotReady, setSnapshotReady] = useState(!workout?.id)

  const isDirty = useDirtyState(
    { name, description, isTemplate, daysOfWeek, exercises },
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

      let setsByExercise = new Map<string, ExerciseSet[]>()
      try {
        const ids = exerciseList.map(e => e.id)
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalized: Exercise[] = exerciseList.map((ex: any) => {
        const sets = (setsByExercise.get(ex.id) ?? [])
          .slice()
          .sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number)
        const baseSets = sets.length > 0 ? sets : seedSetsFromLegacy(ex)
        const type: ExerciseType = ex.exercise_type === 'cardio' ? 'cardio' : 'strength'
        return {
          ...ex,
          exercise_type: type,
          exercise_sets: type === 'cardio' ? hydrateCardioInputs(baseSets) : baseSets,
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
      },
    ])
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

  const moveExercise = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= exercises.length) return
    const updated = [...exercises]
    const [moved] = updated.splice(index, 1)
    updated.splice(newIndex, 0, moved)
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

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Please enter a workout name', 'error')
      return
    }

    setSaving(true)
    try {
      let workoutId = workout?.id

      if (workoutId) {
        const { error } = await supabase
          .from('workouts')
          .update({
            name,
            description,
            is_template: isTemplate,
            days_of_week: daysOfWeek,
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
            days_of_week: daysOfWeek,
          })
          .select()
          .single()
        if (error) throw error
        workoutId = data.id
      }

      // Replace strategy: delete then re-insert exercises (which cascade-deletes sets).
      if (workout?.id) {
        await supabase.from('exercises').delete().eq('workout_id', workoutId)
      }

      if (exercises.length > 0) {
        const exercisesToInsert = exercises.map(ex => ({
          workout_id: workoutId,
          name: ex.name,
          exercise_type: ex.exercise_type ?? 'strength',
          // Keep legacy columns populated as a fallback for any non-builder readers.
          // Weight is no longer prescribed by the coach; the column stays empty.
          sets: ex.exercise_sets?.length ?? null,
          reps: ex.exercise_sets?.[0]?.target_reps ?? ex.reps ?? '',
          weight: '',
          rest_seconds: ex.rest_seconds,
          notes: ex.notes,
          order_index: ex.order_index,
          // The last exercise can't pair with anything, so always false there.
          pair_with_next: ex.order_index < exercises.length - 1 ? !!ex.pair_with_next : false,
        }))
        const { data: insertedExercises, error: exErr } = await supabase
          .from('exercises')
          .insert(exercisesToInsert)
          .select('id, order_index')
        if (exErr) throw exErr

        const sortedInserted = (insertedExercises || []).sort(
          (a, b) => a.order_index - b.order_index
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setsToInsert: any[] = []
        exercises.forEach((ex, exIndex) => {
          const insertedEx = sortedInserted[exIndex]
          if (!insertedEx) return
          const isCardio = ex.exercise_type === 'cardio'
          ;(ex.exercise_sets ?? []).forEach(s => {
            // Cardio: parse the user's typed text into seconds; clear the reps text.
            // Strength: keep target_reps as-is; no duration.
            const durationSeconds = isCardio ? parseDuration(s.target_reps) : null
            setsToInsert.push({
              exercise_id: insertedEx.id,
              set_number: s.set_number,
              target_reps: isCardio ? '' : s.target_reps,
              target_duration_seconds: durationSeconds,
              notes: s.notes,
            })
          })
        })

        if (setsToInsert.length > 0) {
          const { error: setErr } = await supabase.from('exercise_sets').insert(setsToInsert)
          if (setErr) throw setErr
        }
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
        <IconButton onClick={onClose} aria-label="Go back">
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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Days <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <DayOfWeekSelector value={daysOfWeek} onChange={setDaysOfWeek} />
        </div>

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
        <div className="space-y-3">
          {(() => {
            // Group consecutive paired exercises so the visual frame matches the data.
            type ExerciseGroup = { startIndex: number; exercises: Exercise[] }
            const groups: ExerciseGroup[] = []
            exercises.forEach((ex, i) => {
              const prev = exercises[i - 1]
              const continueGroup = !!prev?.pair_with_next
              const last = groups[groups.length - 1]
              if (continueGroup && last) last.exercises.push(ex)
              else groups.push({ startIndex: i, exercises: [ex] })
            })

            const renderCard = (exercise: Exercise, index: number) => {
              const sets = exercise.exercise_sets ?? []
              const type: ExerciseType = exercise.exercise_type ?? 'strength'
              const isCardio = type === 'cardio'
              return (
              <div
                key={index}
                className="bg-white rounded-xl border border-slate-200 p-4"
              >
                <div className="flex justify-between items-center mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                      Exercise {index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      onClick={() => moveExercise(index, 'up')}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ChevronUp size={16} />
                    </IconButton>
                    <IconButton
                      onClick={() => moveExercise(index, 'down')}
                      disabled={index === exercises.length - 1}
                      aria-label="Move down"
                    >
                      <ChevronDown size={16} />
                    </IconButton>
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
                return renderCard(group.exercises[0], group.startIndex)
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
                    {group.exercises.map((ex, j) =>
                      renderCard(ex, group.startIndex + j)
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* Spacer so the sticky bar never covers the last card */}
      <div className="h-24" aria-hidden />

      {/* Sticky action bar — persistent save target on long forms (esp. mobile). */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 mt-6 bg-white/90 backdrop-blur border-t border-slate-200 flex items-center gap-3 z-20">
        <UnsavedBadge visible={isDirty && !saving} />
        <div className="flex-1" />
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} loading={saving}>
          {!saving && <Save size={16} />}
          {saving ? 'Saving…' : 'Save Workout'}
        </Button>
      </div>
    </div>
  )
}
