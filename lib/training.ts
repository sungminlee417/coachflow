import type { Exercise, ExerciseSet } from './types'

/**
 * Resolve the prescribed sets for an exercise.
 *
 * Newer workouts populate `exercise_sets` directly. Older ones (created before
 * per-set rows existed) only have the legacy flat `sets`/`reps` columns; we
 * synthesize a uniform set list from those so the loggers can render a table
 * either way.
 */
export const buildPrescribedSets = (exercise: Exercise): ExerciseSet[] => {
  if (exercise.exercise_sets && exercise.exercise_sets.length > 0) {
    return [...exercise.exercise_sets].sort((a, b) => a.set_number - b.set_number)
  }
  const count = Math.max(1, exercise.sets ?? 1)
  return Array.from({ length: count }, (_, i) => ({
    set_number: i + 1,
    target_reps: exercise.reps ?? '',
    target_duration_seconds: null,
    notes: '',
  }))
}
