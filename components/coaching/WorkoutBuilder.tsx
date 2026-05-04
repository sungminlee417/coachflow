'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { DayOfWeekSelector } from '@/components/ui/DayOfWeekSelector'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { useDirtyState } from '@/lib/use-dirty-state'
import { ArrowLeft, Plus, X, ChevronUp, ChevronDown, Save } from 'lucide-react'
import type { DayOfWeek, Exercise, ExerciseSet, Workout } from '@/lib/types'

interface WorkoutBuilderProps {
  coachId: string
  workout: Workout | null
  onClose: () => void
}

const emptySet = (setNumber: number, copyFrom?: ExerciseSet): ExerciseSet => ({
  set_number: setNumber,
  target_reps: copyFrom?.target_reps ?? '',
  notes: '',
})

// Build initial exercise_sets when an exercise has none yet — derive from
// legacy `sets` count + flat reps so existing workouts keep rendering.
const seedSetsFromLegacy = (ex: Exercise): ExerciseSet[] => {
  const count = Math.max(1, ex.sets ?? 1)
  return Array.from({ length: count }, (_, i) => ({
    set_number: i + 1,
    target_reps: ex.reps ?? '',
    notes: '',
  }))
}

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
      const { data, error } = await supabase
        .from('exercises')
        .select('*, exercise_sets ( id, set_number, target_reps, target_weight, notes )')
        .eq('workout_id', workout.id)
        .order('order_index')

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalized: Exercise[] = (data || []).map((ex: any) => {
        const sets: ExerciseSet[] = (ex.exercise_sets || [])
          .slice()
          .sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number)
        return {
          ...ex,
          exercise_sets: sets.length > 0 ? sets : seedSetsFromLegacy(ex),
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
        sets: null,
        reps: '',
        weight: '',
        rest_seconds: 60,
        notes: '',
        order_index: exercises.length,
        exercise_sets: [emptySet(1)],
      },
    ])
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
          // Keep legacy columns populated as a fallback for any non-builder readers.
          // Weight is no longer prescribed by the coach; the column stays empty.
          sets: ex.exercise_sets?.length ?? null,
          reps: ex.exercise_sets?.[0]?.target_reps ?? ex.reps ?? '',
          weight: '',
          rest_seconds: ex.rest_seconds,
          notes: ex.notes,
          order_index: ex.order_index,
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
          ;(ex.exercise_sets ?? []).forEach(s => {
            setsToInsert.push({
              exercise_id: insertedEx.id,
              set_number: s.set_number,
              target_reps: s.target_reps,
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
          {exercises.map((exercise, index) => {
            const sets = exercise.exercise_sets ?? []
            return (
              <div key={index} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Exercise {index + 1}
                  </span>
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

                <Input
                  value={exercise.name}
                  onChange={e => updateExercise(index, 'name', e.target.value)}
                  placeholder="Exercise name (e.g., Barbell Squat)"
                  className="mb-3"
                />

                {/* Per-set table */}
                <div className="bg-slate-50 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      Sets
                    </span>
                    <div className="flex items-center gap-2">
                      {sets.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => fillSetsFromFirst(index)}
                          className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                        >
                          Copy set 1 to all
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => addSet(index)}
                        className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        + Add set
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1 px-1">
                    <div className="col-span-2">Set</div>
                    <div className="col-span-9">Reps</div>
                    <div className="col-span-1" />
                  </div>

                  {sets.length === 0 ? (
                    <p className="text-xs text-slate-400 italic px-1 py-2">
                      No sets yet. Click &ldquo;+ Add set&rdquo; to add one.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {sets.map((s, setIndex) => (
                        <div key={setIndex} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-2 text-sm font-medium text-slate-500 text-center">
                            {s.set_number}
                          </div>
                          <div className="col-span-9">
                            <Input
                              value={s.target_reps}
                              onChange={e => updateSet(index, setIndex, 'target_reps', e.target.value)}
                              placeholder="8 or 6-10 or AMRAP"
                              className="text-sm"
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <IconButton
                              tone="danger"
                              onClick={() => removeSet(index, setIndex)}
                              aria-label="Remove set"
                              disabled={sets.length === 1}
                            >
                              <X size={14} />
                            </IconButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Rest (seconds)</label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={exercise.rest_seconds ?? ''}
                      onChange={e => updateExercise(index, 'rest_seconds', e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Notes</label>
                    <Input
                      value={exercise.notes}
                      onChange={e => updateExercise(index, 'notes', e.target.value)}
                      placeholder="Form cues, tempo, etc."
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <UnsavedBadge visible={isDirty && !saving} />
        <div className="flex-1" />
        <Button onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Workout'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
