// Single source of truth for all TanStack Query keys.
//
// Why centralised: every `useQuery` and `queryClient.invalidateQueries`
// call must use the *exact same* key shape, or invalidation silently
// misses and the data goes stale. Pulling the keys into one module
// catches drift at the type level and lets the editor jump-to-def from
// any reader to every writer that affects it.
//
// Convention: each helper returns a fully-typed tuple. Use a `const`
// assertion downstream where you want to narrow a partial prefix.

export const queryKeys = {
  // --- Trainee logs ---
  setLogs: {
    /** Per-exercise persistence — read by ExerciseSetLogger / SupersetLogger. */
    forExercise: (assignmentId: string, exerciseId: string, date: string) =>
      ['set_logs', 'exercise', assignmentId, exerciseId, date] as const,
    /** Day-wide summary for the Today dashboard. */
    daySummary: (clientId: string, date: string) =>
      ['set_logs', 'day-summary', clientId, date] as const,
    /** Lifetime aggregate for the Progress page (PRs, heatmap). */
    lifetime: (clientId: string) => ['set_logs', 'lifetime', clientId] as const,
    /** Streak source — recent completed dates. */
    streak: (clientId: string) => ['set_logs', 'streak', clientId] as const,
    /** Prefix used to invalidate every set_logs cache for a client. */
    all: () => ['set_logs'] as const,
  },

  mealLogs: {
    /** Eaten state for one day. */
    forDay: (clientId: string, date: string) =>
      ['meal_logs', clientId, date] as const,
    all: () => ['meal_logs'] as const,
  },

  weightLogs: {
    /** Recent N weight entries for a user. */
    list: (userId: string) => ['weight_logs', userId] as const,
    all: () => ['weight_logs'] as const,
  },

  bodyMeasurements: {
    list: (userId: string) => ['body_measurements', userId] as const,
    /** Just the most-recent recorded_at for the Today card. */
    latest: (userId: string) => ['body_measurements', 'latest', userId] as const,
    all: () => ['body_measurements'] as const,
  },

  // --- Assignments + workout/meal-plan data ---
  workoutAssignments: {
    forDay: (clientId: string, date: string) =>
      ['workout_assignments', clientId, date] as const,
    all: () => ['workout_assignments'] as const,
  },

  mealPlanAssignments: {
    forDay: (clientId: string, date: string) =>
      ['meal_plan_assignments', clientId, date] as const,
    all: () => ['meal_plan_assignments'] as const,
  },

  /** Prior-week performance hint, per (exercise, variant). */
  priorPerformance: {
    forExercise: (
      assignmentId: string,
      exerciseId: string,
      date: string,
      variant: string | null
    ) =>
      [
        'prior_performance',
        assignmentId,
        exerciseId,
        date,
        variant ?? '',
      ] as const,
  },
}
