import type { SupabaseClient } from '@supabase/supabase-js'
import { unwrapJoin, weekdayOf } from './utils'
import type {
  DayOfWeek,
  Exercise,
  ExerciseSet,
  ExerciseType,
  Food,
  Ingredient,
  Meal,
  MealPlanAssignment,
  WorkoutAssignment,
} from './types'

/**
 * `start_date.is.null,start_date.lte.{date}` and `end_date.is.null,end_date.gte.{date}`
 * are the two `.or()` filters Supabase needs to express "active on this day"
 * across nullable open-ended ranges. Centralized so every assignment view
 * applies them identically.
 */
const applyDateWindow = <Q extends { or: (s: string) => Q }>(query: Q, dateISO: string): Q =>
  query
    .or(`start_date.is.null,start_date.lte.${dateISO}`)
    .or(`end_date.is.null,end_date.gte.${dateISO}`)

const matchesWeekday = (
  scheduled: DayOfWeek[] | null | undefined,
  weekday: number
): boolean => {
  const days = scheduled ?? []
  // Empty array is the "every day" sentinel — coaches use it for daily plans.
  return days.length === 0 || days.includes(weekday as DayOfWeek)
}

/**
 * Fetch all workout assignments active on `dateISO` for `clientId`, with
 * exercises and per-set rows pre-sorted and the `pair_with_next` chain intact.
 * Filters out workouts not scheduled for the date's weekday.
 */
export async function fetchActiveWorkoutAssignments(
  supabase: SupabaseClient,
  clientId: string,
  dateISO: string
): Promise<WorkoutAssignment[]> {
  const base = supabase
    .from('workout_assignments')
    .select(`
      id, start_date, end_date, completed, completed_at, notes, coach_id,
      workout:workout_id (
        id, name, description, days_of_week,
        exercises (
          id, name, exercise_type, sets, reps, weight, rest_seconds, notes, order_index, pair_with_next,
          exercise_sets ( id, set_number, target_reps, target_duration_seconds, notes )
        )
      )
    `)
    .eq('client_id', clientId)

  const { data, error } = await applyDateWindow(base, dateISO)
  if (error) throw error

  const weekday = weekdayOf(dateISO)

  return (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any): WorkoutAssignment => {
      const workout = unwrapJoin<{
        id: string
        name: string
        description: string
        days_of_week: DayOfWeek[] | null
        exercises: Exercise[]
      }>(item.workout)
      return {
        ...item,
        workout: {
          ...workout,
          days_of_week: workout?.days_of_week ?? [],
          exercises: (workout?.exercises ?? [])
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map(ex => ({
              ...ex,
              exercise_type: (ex.exercise_type ?? 'strength') as ExerciseType,
              exercise_sets: (ex.exercise_sets ?? [])
                .slice()
                .sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number),
            })),
        },
      }
    })
    .filter(item => matchesWeekday(item.workout?.days_of_week, weekday))
}

/**
 * Fetch all meal-plan assignments active on `dateISO` for `clientId`. Sorts
 * meals by time → meal_type → order_index and filters by weekday. Drops
 * assignments where every meal got filtered out (no work for the user to see).
 */
export async function fetchActiveMealPlanAssignments(
  supabase: SupabaseClient,
  clientId: string,
  dateISO: string
): Promise<MealPlanAssignment[]> {
  const base = supabase
    .from('meal_plan_assignments')
    .select(`
      id, start_date, end_date, notes, coach_id,
      meal_plan:meal_plan_id (
        id, name, description,
        meals (
          id, meal_type, name, description, days_of_week, time, order_index,
          foods (
            id, name, quantity, calories, protein_grams, carbs_grams, fat_grams, order_index,
            ingredients ( id, name, quantity, calories, protein_grams, carbs_grams, fat_grams, order_index )
          )
        )
      )
    `)
    .eq('client_id', clientId)

  const { data, error } = await applyDateWindow(base, dateISO)
  if (error) throw error

  const weekday = weekdayOf(dateISO)

  const MEAL_TYPE_ORDER: Record<Meal['meal_type'], number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2,
    snack: 3,
  }

  return (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any): MealPlanAssignment => {
      const plan = unwrapJoin<{
        id: string
        name: string
        description: string
        meals: Meal[]
      }>(item.meal_plan)
      return {
        ...item,
        meal_plan: {
          ...plan,
          meals: (plan?.meals ?? [])
            .filter(m => matchesWeekday(m.days_of_week, weekday))
            .map(m => ({
              ...m,
              days_of_week: m.days_of_week ?? [],
              foods: (m.foods ?? [])
                .slice()
                .sort((a: Food, b: Food) => a.order_index - b.order_index)
                .map(f => ({
                  ...f,
                  ingredients: (f.ingredients ?? [])
                    .slice()
                    .sort((a: Ingredient, b: Ingredient) => a.order_index - b.order_index),
                })),
            }))
            .sort((a, b) => {
              // Timed meals chronological; untimed fall back to type then index.
              if (a.time && b.time) return a.time.localeCompare(b.time)
              if (a.time) return -1
              if (b.time) return 1
              return (
                MEAL_TYPE_ORDER[a.meal_type] - MEAL_TYPE_ORDER[b.meal_type] ||
                a.order_index - b.order_index
              )
            }),
        },
      }
    })
    .filter(item => (item.meal_plan?.meals?.length ?? 0) > 0)
}
