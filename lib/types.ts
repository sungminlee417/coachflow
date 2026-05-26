export type LengthUnit = 'in' | 'cm'
export type WeightUnit = 'lbs' | 'kg'
export type ThemePreference = 'system' | 'light' | 'dark'

export interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url?: string | null
  length_unit?: LengthUnit
  weight_unit?: WeightUnit
  /** Optional body-weight goal; rendered as a dashed line on the weight
   *  chart. NULL = no goal set. */
  weight_goal?: number | null
  /** Anchor date for "Week N" labels on the weight tracker. When set,
   *  the chart marks weekly boundaries from this date and the share
   *  dialog tags each entry with its program week. NULL = unset. */
  weight_program_start_date?: string | null
  /** Settings → Preferences toggles. Default true (historical behavior). */
  rest_timer_enabled?: boolean
  show_streak_card?: boolean
  /** Settings → Appearance. 'system' follows OS prefers-color-scheme;
   *  'light' / 'dark' force the theme regardless of OS preference. */
  theme?: ThemePreference
  created_at?: string
  updated_at?: string
}

export interface Client {
  id: string
  full_name: string
  email: string
  started_at?: string
  // Most-recent activity timestamp across the client's logging tables
  // (set_logs, meal_logs, weight_logs, body_measurements). Used by the
  // coach's ClientList to surface inactive clients without each coach
  // having to hover-check every profile. `null` = no logs ever.
  last_active_date?: string | null
}

export interface Workout {
  id: string
  name: string
  description: string
  is_template: boolean
  // Weekly recurrence (used when cycle_length is null). Empty = every day.
  days_of_week?: DayOfWeek[]
  // Rolling N-day rotation. Both fields are non-null together; cycle_position
  // is 1-based and bounded by cycle_length. When set, days_of_week is ignored.
  cycle_length?: number | null
  cycle_position?: number | null
  created_at?: string
  exercise_count?: number
}

// A coach-side bundle of workouts. Assigning a program fans out into one
// `workout_assignments` row per member workout, so trainees still see
// individual workouts and existing assignments are unaffected.
export interface WorkoutProgram {
  id: string
  name: string
  description: string
  is_template: boolean
  created_at?: string
  workout_count?: number
  // Populated when fetching with members (in `ProgramBuilder`).
  workouts?: Workout[]
}

export type ExerciseType = 'strength' | 'cardio'

export interface Exercise {
  id?: string
  name: string
  // 'strength' = reps/weight; 'cardio' = duration. Defaults to 'strength'.
  exercise_type?: ExerciseType
  // Legacy single-prescription columns; now used only as a fallback for
  // exercises that have no per-set rows.
  sets: number | null
  reps: string
  weight: string
  rest_seconds: number | null
  notes: string
  order_index: number
  // True = this exercise is performed back-to-back with the next one (superset).
  // Chains of true values build a superset of N exercises.
  pair_with_next?: boolean
  exercise_sets?: ExerciseSet[]
  // Coach-defined fallback names ("Goblet Squat", "Leg Press") shown as chips
  // beneath the title for the trainee. Names only — they aren't linked to other
  // exercise rows.
  alternatives?: string[]
  // The substitute the client picked for this exercise on the day being viewed.
  // Null/undefined means the original exercise is in play. Computed per-day in
  // the assignment fetch — not stored on the exercise itself.
  substitution?: string | null
  // Link to a curated catalog entry (see `lib/exercise-catalog.ts`). NULL
  // for freeform exercises typed by the coach.
  catalog_id?: string | null
  // Cardio machine type — drives which prescription fields the builder
  // shows ("Speed + Incline" for treadmill, "Resistance" for cycle, etc.).
  // NULL = generic cardio, behaves like the legacy free-duration cardio.
  cardio_subtype?: string | null
}

export interface ExerciseSet {
  id?: string
  exercise_id?: string
  set_number: number
  target_reps: string
  // Only used for cardio exercises. Null for strength.
  target_duration_seconds?: number | null
  notes: string
  // Cardio prescription. Text (not number) so coaches can write ranges
  // like "3-4" or "10-15" the same way they write rep ranges. Whichever
  // of these is relevant depends on `Exercise.cardio_subtype`.
  target_speed?: string | null
  target_incline?: string | null
  target_resistance?: string | null
}

export interface SetLog {
  id?: string
  assignment_id: string
  exercise_id: string
  set_number: number
  // Day this set was performed. Mirrors meal_logs.logged_date — recurring
  // workouts get one row per occurrence so previous performances aren't
  // overwritten and progressive overload comparisons remain possible.
  logged_date: string
  reps_performed: number | null
  weight_performed: number | null
  duration_performed_seconds?: number | null
  completed: boolean
  notes: string | null
  // Cardio actuals — numeric for charting / PR detection. NULL when not
  // a cardio set or simply not recorded.
  speed_performed?: number | null
  incline_performed?: number | null
  resistance_performed?: number | null
}

export interface WorkoutAssignment {
  id: string
  start_date?: string | null
  end_date?: string | null
  completed?: boolean
  completed_at?: string | null
  notes?: string | null
  // The coach who created the assignment. Equals the trainee's own id for
  // self-assigned workouts — used to gate the "Unassign" button.
  coach_id?: string
  // For cycle-based workouts: the calendar date that maps to position 1 of
  // the rotation. Null when the workout uses weekly scheduling.
  cycle_anchor_date?: string | null
  workout: {
    id: string
    name: string
    description?: string
    days_of_week?: DayOfWeek[]
    cycle_length?: number | null
    cycle_position?: number | null
    exercises?: Exercise[]
  }
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

// 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat. Empty array = any day.
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Ingredient {
  id?: string
  food_id?: string | null
  name: string
  quantity: string
  calories: number | null
  protein_grams: number | null
  carbs_grams: number | null
  fat_grams: number | null
  order_index: number
}

// Coach-defined fallback for a food, with its own quantity + macros so the
// trainee knows exactly how much of the substitute to eat (218 cal of rice is
// a different weight than 218 cal of potato). Quantity and macros are all
// optional; legacy rows that only have a name still render as a name chip.
export interface FoodAlternative {
  id?: string
  food_id?: string
  name: string
  quantity: string
  calories: number | null
  protein_grams: number | null
  carbs_grams: number | null
  fat_grams: number | null
  order_index: number
}

export interface Food {
  id?: string
  meal_id?: string
  name: string
  quantity: string
  calories: number | null
  protein_grams: number | null
  carbs_grams: number | null
  fat_grams: number | null
  order_index: number
  ingredients?: Ingredient[]
  // Coach-defined fallbacks ("Greek yogurt", "Cottage cheese") shown beneath
  // the food on the trainee side. Display-only — picking one doesn't record
  // a per-day substitution.
  alternatives?: FoodAlternative[]
}

export interface Meal {
  id?: string
  meal_type: MealType
  name: string
  description: string
  days_of_week: DayOfWeek[]
  // HH:MM (24h) string, e.g. "08:00". Null = no specific time.
  time: string | null
  // Macros are derived from items (foods + their ingredients).
  // These columns are kept for legacy data but are no longer set by the app.
  calories: number | null
  protein_grams: number | null
  carbs_grams: number | null
  fat_grams: number | null
  order_index: number
  foods?: Food[]
}

export interface MacroTotals {
  calories: number
  protein_grams: number
  carbs_grams: number
  fat_grams: number
}

export interface MealPlan {
  id: string
  name: string
  description: string
  is_template: boolean
  created_at?: string
  meal_count?: number
}

export interface MealPlanAssignment {
  id: string
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
  coach_id?: string
  meal_plan: {
    id: string
    name: string
    description?: string
    meals: Meal[]
  }
}

// Daily meal-eaten checkmark. Keyed on (meal_id, user_id, logged_date) — meal
// plans recur, so each calendar day gets its own log.
export interface MealLog {
  id?: string
  assignment_id: string
  meal_id: string
  user_id: string
  logged_date: string
  completed: boolean
  notes?: string | null
}

export interface WeightLog {
  id?: string
  user_id?: string
  recorded_at: string
  weight: number
  notes: string | null
}

export interface BodyMeasurement {
  id?: string
  user_id?: string
  recorded_at: string
  neck: number | null
  waist: number | null
  hips: number | null
  // Muscles where flexed/relaxed matters — store the value plus a boolean.
  shoulders: number | null
  shoulders_flexed: boolean
  chest: number | null
  chest_flexed: boolean
  thigh_left: number | null
  thigh_left_flexed: boolean
  thigh_right: number | null
  thigh_right_flexed: boolean
  calf_left: number | null
  calf_left_flexed: boolean
  calf_right: number | null
  calf_right_flexed: boolean
  arm_left: number | null
  arm_left_flexed: boolean
  arm_right: number | null
  arm_right_flexed: boolean
  notes: string | null
}

export interface InviteCode {
  id: string
  code: string
  status: string
  max_uses: number
  times_used: number
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}
