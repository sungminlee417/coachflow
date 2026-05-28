'use client'

// Centralised cache-invalidation helpers shared by every write path
// that touches a workout_assignments / meal_plan_assignments row, plus
// the per-day substitution swap.
//
// The pattern used to live inline at every call site (the modal that
// performed the write, the deep view that unassigned, the picker that
// swapped). That meant a new query key (e.g. the Today unfinished-
// workout banner) had to be remembered in every one of those branches,
// and one or two always got missed — see the "warning doesn't go away"
// bug from May 2026. Consolidating here gives us a single thing to
// update when a new derived query comes online.
//
// When the writer is a *coach* acting on a client (assigning, removing),
// pass `coachId` so we also invalidate that coach's `clients.forCoach`
// cache (the "last seen" pill on the Clients list reads from there).

import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

interface SyncOptions {
  /** When the writer is a coach, pass their id so the coach-side
   *  client roster (and its activity badges) is invalidated too. */
  coachId?: string
}

export function useAssignmentSync() {
  const qc = useQueryClient()

  const invalidateWorkouts = ({ coachId }: SyncOptions = {}) => {
    const tasks = [
      qc.invalidateQueries({ queryKey: queryKeys.workoutAssignments.all() }),
      qc.invalidateQueries({ queryKey: ['today'] }),
    ]
    if (coachId) {
      tasks.push(qc.invalidateQueries({ queryKey: queryKeys.clients.forCoach(coachId) }))
    }
    return Promise.all(tasks)
  }

  const invalidateMealPlans = ({ coachId }: SyncOptions = {}) => {
    const tasks = [
      qc.invalidateQueries({ queryKey: queryKeys.mealPlanAssignments.all() }),
      qc.invalidateQueries({ queryKey: ['today'] }),
    ]
    if (coachId) {
      tasks.push(qc.invalidateQueries({ queryKey: queryKeys.clients.forCoach(coachId) }))
    }
    return Promise.all(tasks)
  }

  return { invalidateWorkouts, invalidateMealPlans }
}
