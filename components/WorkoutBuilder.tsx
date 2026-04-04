'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

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
    } catch (error) {
      console.error('Error fetching exercises:', error)
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
    // Update order indices
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
      alert('Please enter a workout name')
      return
    }

    setSaving(true)
    try {
      let workoutId = workout?.id

      if (workoutId) {
        // Update existing workout
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
        // Create new workout
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

      // Delete existing exercises if editing
      if (workout?.id) {
        await supabase
          .from('exercises')
          .delete()
          .eq('workout_id', workoutId)
      }

      // Insert exercises
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
    } catch (error) {
      console.error('Error saving workout:', error)
      alert('Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            {workout ? 'Edit Workout' : 'Create Workout'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Workout Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Full Body Strength"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this workout..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isTemplate"
                checked={isTemplate}
                onChange={(e) => setIsTemplate(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isTemplate" className="ml-2 text-sm text-gray-700">
                Save as template (reusable for multiple clients)
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Exercises</h3>
          <button
            onClick={addExercise}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
          >
            + Add Exercise
          </button>
        </div>

        {exercises.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-500 mb-4">No exercises yet. Add your first exercise!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {exercises.map((exercise, index) => (
              <div key={index} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-medium text-gray-500">Exercise {index + 1}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => moveExercise(index, 'up')}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveExercise(index, 'down')}
                      disabled={index === exercises.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeExercise(index)}
                      className="text-red-500 hover:text-red-700 ml-2"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Exercise Name *
                    </label>
                    <input
                      type="text"
                      value={exercise.name}
                      onChange={(e) => updateExercise(index, 'name', e.target.value)}
                      placeholder="e.g., Barbell Squat"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sets
                    </label>
                    <input
                      type="number"
                      value={exercise.sets || ''}
                      onChange={(e) => updateExercise(index, 'sets', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="3"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reps
                    </label>
                    <input
                      type="text"
                      value={exercise.reps}
                      onChange={(e) => updateExercise(index, 'reps', e.target.value)}
                      placeholder="8-12 or AMRAP"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Weight
                    </label>
                    <input
                      type="text"
                      value={exercise.weight}
                      onChange={(e) => updateExercise(index, 'weight', e.target.value)}
                      placeholder="135 lbs or RPE 8"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rest (seconds)
                    </label>
                    <input
                      type="number"
                      value={exercise.rest_seconds || ''}
                      onChange={(e) => updateExercise(index, 'rest_seconds', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="60"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={exercise.notes}
                      onChange={(e) => updateExercise(index, 'notes', e.target.value)}
                      placeholder="Form cues, tempo, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving ? 'Saving...' : 'Save Workout'}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
