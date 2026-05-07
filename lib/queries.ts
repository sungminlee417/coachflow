import type { SupabaseClient } from '@supabase/supabase-js'
import { cyclePositionFor, unwrapJoin, weekdayOf } from './utils'
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

// Row shapes returned by the joined PostgREST queries below. PostgREST returns
// the joined `workout`/`meal_plan` either as a single object or a single-element
// array depending on the relationship — `unwrapJoin()` collapses both to the
// scalar form. Defining these explicitly here drops the `any` casts and makes
// the field surface visible at a glance.
interface AlternativeRow {
  id?: string
  name: string
  order_index: number
}

interface ExerciseJoinedRow extends Exercise {
  exercise_alternatives?: AlternativeRow[]
}

interface WorkoutJoinedRow {
  id: string
  name: string
  description: string
  days_of_week: DayOfWeek[] | null
  cycle_length: number | null
  cycle_position: number | null
  exercises: ExerciseJoinedRow[]
}

interface WorkoutAssignmentRow {
  id: string
  start_date: string | null
  end_date: string | null
  completed: boolean | null
  completed_at: string | null
  notes: string | null
  coach_id: string
  cycle_anchor_date: string | null
  // Supabase serializes single-row joins as either an object or an array
  // depending on relationship cardinality.
  workout: WorkoutJoinedRow | WorkoutJoinedRow[] | null
}

interface MealPlanJoinedRow {
  id: string
  name: string
  description: string
  meals: Meal[]
}

interface MealPlanAssignmentRow {
  id: string
  start_date: string | null
  end_date: string | null
  notes: string | null
  coach_id: string
  meal_plan: MealPlanJoinedRow | MealPlanJoinedRow[] | null
}

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
 * A workout shows on `dateISO` if either its rotation lands on this date
 * (cycle mode) or its weekday matches (weekly mode). Cycle mode wins when
 * `cycle_length` and `cycle_position` are both set on the workout AND the
 * assignment carries a `cycle_anchor_date`.
 */
const matchesSchedule = (
  cycleLength: number | null | undefined,
  cyclePosition: number | null | undefined,
  cycleAnchor: string | null | undefined,
  scheduledDays: DayOfWeek[] | null | undefined,
  weekday: number,
  dateISO: string
): boolean => {
  if (cycleLength != null && cyclePosition != null && cycleAnchor) {
    const pos = cyclePositionFor(cycleAnchor, dateISO, cycleLength)
    return pos === cyclePosition
  }
  return matchesWeekday(scheduledDays, weekday)
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
      id, start_date, end_date, completed, completed_at, notes, coach_id, cycle_anchor_date,
      workout:workout_id (
        id, name, description, days_of_week, cycle_length, cycle_position,
        exercises (
          id, name, exercise_type, sets, reps, weight, rest_seconds, notes, order_index, pair_with_next,
          exercise_sets ( id, set_number, target_reps, target_duration_seconds, notes ),
          exercise_alternatives ( id, name, order_index )
        )
      )
    `)
    .eq('client_id', clientId)

  const { data, error } = await applyDateWindow(base, dateISO)
  if (error) throw error

  const weekday = weekdayOf(dateISO)

  // Pull today's substitutions in one query for all matched assignments. Done
  // after the assignment fetch so we know the candidate ids and don't have to
  // round-trip per assignment. Failures here downgrade gracefully to "no swap".
  const assignmentIds = (data ?? []).map((d: { id: string }) => d.id)
  const subKey = (assignmentId: string, exerciseId: string) =>
    `${assignmentId}::${exerciseId}`
  const substitutions = new Map<string, string>()
  if (assignmentIds.length > 0) {
    try {
      const { data: subs } = await supabase
        .from('exercise_substitutions')
        .select('assignment_id, exercise_id, substituted_name')
        .in('assignment_id', assignmentIds)
        .eq('logged_date', dateISO)
      for (const s of (subs ?? []) as {
        assignment_id: string
        exercise_id: string
        substituted_name: string
      }[]) {
        substitutions.set(subKey(s.assignment_id, s.exercise_id), s.substituted_name)
      }
    } catch {
      // Substitutions are non-essential for rendering — swallow and continue.
    }
  }

  return ((data ?? []) as WorkoutAssignmentRow[])
    .map((item): WorkoutAssignment => {
      const workout = unwrapJoin<WorkoutJoinedRow>(item.workout)
      return {
        id: item.id,
        start_date: item.start_date,
        end_date: item.end_date,
        // The DB row uses `null` for missing values; the public type uses
        // `undefined`. Normalize at the boundary so consumers don't need to
        // handle both.
        completed: item.completed ?? undefined,
        completed_at: item.completed_at,
        notes: item.notes,
        coach_id: item.coach_id,
        cycle_anchor_date: item.cycle_anchor_date,
        workout: {
          id: workout?.id ?? '',
          name: workout?.name ?? '',
          description: workout?.description ?? '',
          days_of_week: workout?.days_of_week ?? [],
          cycle_length: workout?.cycle_length ?? null,
          cycle_position: workout?.cycle_position ?? null,
          exercises: (workout?.exercises ?? [])
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map(ex => ({
              ...ex,
              exercise_type: (ex.exercise_type ?? 'strength') as ExerciseType,
              exercise_sets: (ex.exercise_sets ?? [])
                .slice()
                .sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number),
              alternatives: (ex.exercise_alternatives ?? [])
                .slice()
                .sort((a, b) => a.order_index - b.order_index)
                .map(alt => alt.name),
              substitution:
                ex.id ? substitutions.get(subKey(item.id, ex.id)) ?? null : null,
            })),
        },
      }
    })
    .filter(item =>
      matchesSchedule(
        item.workout?.cycle_length,
        item.workout?.cycle_position,
        item.cycle_anchor_date,
        item.workout?.days_of_week,
        weekday,
        dateISO
      )
    )
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

  return ((data ?? []) as MealPlanAssignmentRow[])
    .map((item): MealPlanAssignment => {
      const plan = unwrapJoin<MealPlanJoinedRow>(item.meal_plan)
      return {
        id: item.id,
        start_date: item.start_date,
        end_date: item.end_date,
        notes: item.notes,
        coach_id: item.coach_id,
        meal_plan: {
          id: plan?.id ?? '',
          name: plan?.name ?? '',
          description: plan?.description ?? '',
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
