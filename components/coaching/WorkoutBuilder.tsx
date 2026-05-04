'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { useDirtyState } from '@/lib/use-dirty-state'
import { ArrowLeft, Plus, X, ChevronUp, ChevronDown, Save } from 'lucide-react'
import type { Exercise, Workout } from '@/lib/types'

interface WorkoutBuilderProps {
  coachId: string
  workout: Workout | null
  onClose: () => void
}

export default function WorkoutBuilder({ coachId, workout, onClose }: WorkoutBuilderProps) {
  const supabase = useSupabase()
  const [name, setName] = useState(workout?.name || '')
  const [description, setDescription] = useState(workout?.description || '')
  const [isTemplate, setIsTemplate] = useState(workout?.is_template || false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [saving, setSaving] = useState(false)
  // For brand-new workouts, the snapshot can be taken immediately.
  // For existing ones, wait until exercises are loaded.
  const [snapshotReady, setSnapshotReady] = useState(!workout?.id)

  const isDirty = useDirtyState(
    { name, description, isTemplate, exercises },
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
        .select('*')
        .eq('workout_id', workout.id)
        .order('order_index')

      if (error) throw error
      setExercises(data || [])
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
          .update({ name, description, is_template: isTemplate })
          .eq('id', workoutId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('workouts')
          .insert({ coach_id: coachId, name, description, is_template: isTemplate })
          .select()
          .single()
        if (error) throw error
        workoutId = data.id
      }

      if (workout?.id) {
        await supabase.from('exercises').delete().eq('workout_id', workoutId)
      }

      if (exercises.length > 0) {
        const toInsert = exercises.map(ex => ({
          workout_id: workoutId,
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          weight: ex.weight,
          rest_seconds: ex.rest_seconds,
          notes: ex.notes,
          order_index: ex.order_index,
        }))
        const { error } = await supabase.from('exercises').insert(toInsert)
        if (error) throw error
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
          {exercises.map((exercise, index) => (
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Input
                    value={exercise.name}
                    onChange={e => updateExercise(index, 'name', e.target.value)}
                    placeholder="Exercise name (e.g., Barbell Squat)"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Sets</label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={exercise.sets ?? ''}
                    onChange={e => updateExercise(index, 'sets', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="3"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Reps</label>
                  <Input
                    value={exercise.reps}
                    onChange={e => updateExercise(index, 'reps', e.target.value)}
                    placeholder="8-12 or AMRAP"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Weight</label>
                  <Input
                    value={exercise.weight}
                    onChange={e => updateExercise(index, 'weight', e.target.value)}
                    placeholder="135 lbs or RPE 8"
                  />
                </div>
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
                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Notes</label>
                  <Input
                    value={exercise.notes}
                    onChange={e => updateExercise(index, 'notes', e.target.value)}
                    placeholder="Form cues, tempo, etc."
                  />
                </div>
              </div>
            </div>
          ))}
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
