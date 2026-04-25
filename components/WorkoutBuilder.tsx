'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from './Toast'
import { ArrowLeft, Plus, X, ChevronUp, ChevronDown, Save } from 'lucide-react'

interface Exercise {
  id?: string
  name: string
  sets: number | null
  reps: string
  weight: string
  rest_seconds: number | null
  notes: string
  order_index: number
}

interface Workout {
  id?: string
  name: string
  description: string
  is_template: boolean
}

interface WorkoutBuilderProps {
  coachId: string
  workout: Workout | null
  onClose: () => void
}

export default function WorkoutBuilder({ coachId, workout, onClose }: WorkoutBuilderProps) {
  const [name, setName] = useState(workout?.name || '')
  const [description, setDescription] = useState(workout?.description || '')
  const [isTemplate, setIsTemplate] = useState(workout?.is_template || false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (workout?.id) {
      fetchExercises()
    }
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
        order_index: exercises.length
      }
    ])
  }

  const updateExercise = (index: number, field: keyof Exercise, value: any) => {
    const updated = [...exercises]
    updated[index] = { ...updated[index], [field]: value }
    setExercises(updated)
  }

  const removeExercise = (index: number) => {
    const updated = exercises.filter((_, i) => i !== index)
    updated.forEach((ex, i) => ex.order_index = i)
    setExercises(updated)
  }

  const moveExercise = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= exercises.length) return

    const updated = [...exercises]
    const [moved] = updated.splice(index, 1)
    updated.splice(newIndex, 0, moved)
    updated.forEach((ex, i) => ex.order_index = i)
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
            is_template: isTemplate
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
            is_template: isTemplate
          })
          .select()
          .single()

        if (error) throw error
        workoutId = data.id
      }

      if (workout?.id) {
        await supabase
          .from('exercises')
          .delete()
          .eq('workout_id', workoutId)
      }

      if (exercises.length > 0) {
        const exercisesToInsert = exercises.map(ex => ({
          workout_id: workoutId,
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          weight: ex.weight,
          rest_seconds: ex.rest_seconds,
          notes: ex.notes,
          order_index: ex.order_index
        }))

        const { error } = await supabase
          .from('exercises')
          .insert(exercisesToInsert)

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-xl font-bold text-slate-900">
            {workout ? 'Edit Workout' : 'Create Workout'}
          </h2>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="wb-name" className="block text-sm font-medium text-slate-700 mb-1">
              Workout Name
            </label>
            <input
              id="wb-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Full Body Strength"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="wb-desc" className="block text-sm font-medium text-slate-700 mb-1">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="wb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this workout..."
              rows={2}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isTemplate}
              onChange={(e) => setIsTemplate(e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
            />
            <span className="text-sm text-slate-700">Save as template</span>
          </label>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Exercises</h3>
        <button
          onClick={addExercise}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Add Exercise
        </button>
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
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Exercise {index + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveExercise(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 rounded cursor-pointer"
                    aria-label="Move up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => moveExercise(index, 'down')}
                    disabled={index === exercises.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 rounded cursor-pointer"
                    aria-label="Move down"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    onClick={() => removeExercise(index)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded ml-1 cursor-pointer"
                    aria-label="Remove exercise"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={exercise.name}
                    onChange={(e) => updateExercise(index, 'name', e.target.value)}
                    placeholder="Exercise name (e.g., Barbell Squat)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Sets</label>
                  <input
                    type="number"
                    value={exercise.sets || ''}
                    onChange={(e) => updateExercise(index, 'sets', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Reps</label>
                  <input
                    type="text"
                    value={exercise.reps}
                    onChange={(e) => updateExercise(index, 'reps', e.target.value)}
                    placeholder="8-12 or AMRAP"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Weight</label>
                  <input
                    type="text"
                    value={exercise.weight}
                    onChange={(e) => updateExercise(index, 'weight', e.target.value)}
                    placeholder="135 lbs or RPE 8"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Rest (seconds)</label>
                  <input
                    type="number"
                    value={exercise.rest_seconds || ''}
                    onChange={(e) => updateExercise(index, 'rest_seconds', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="60"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Notes</label>
                  <input
                    type="text"
                    value={exercise.notes}
                    onChange={(e) => updateExercise(index, 'notes', e.target.value)}
                    placeholder="Form cues, tempo, etc."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors cursor-pointer"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Workout'}
        </button>
        <button
          onClick={onClose}
          className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
