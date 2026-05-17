'use client'

// Workout + meal-plan assignment reads for a (clientId, date).
//
// These are pure reads with no mutation hooks here — assignment
// creation lives on the coach side; the trainee just observes what's
// active for a given day. Both go through TanStack so the same data
// stays in sync across the Today dashboard and the deep client views.

import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'
import {
  fetchActiveMealPlanAssignments,
  fetchActiveWorkoutAssignments,
} from '@/lib/queries'
import type { MealPlanAssignment, WorkoutAssignment } from '@/lib/types'

export function useWorkoutAssignments(clientId: string, date: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.workoutAssignments.forDay(clientId, date),
    queryFn: (): Promise<WorkoutAssignment[]> =>
      fetchActiveWorkoutAssignments(supabase, clientId, date),
  })
}

export function useMealPlanAssignments(clientId: string, date: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.mealPlanAssignments.forDay(clientId, date),
    queryFn: (): Promise<MealPlanAssignment[]> =>
      fetchActiveMealPlanAssignments(supabase, clientId, date),
  })
}
