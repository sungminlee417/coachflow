-- Indexes the RLS policies from migration 21 rely on.
--
-- WHY THIS IS URGENT
--
-- Migration 21 added `EXISTS` subqueries to the policies on every joined
-- table in the trainee deep-fetch chain:
--   meal_plan_assignments → meal_plans → meals → foods → ingredients
--   workout_assignments   → workouts   → exercises → exercise_sets
--
-- Each subquery looks up `meal_plan_assignments` by `meal_plan_id`,
-- joins meals/foods/ingredients by their FK columns, etc. Postgres does
-- NOT auto-index foreign-key columns, so without supporting indexes the
-- subqueries become sequential scans on every row of every joined
-- table — which hits the `authenticated` role's 8s statement timeout
-- in Supabase as soon as the user has a non-trivial amount of content.
--
-- This migration adds the missing indexes. All are pure additions; no
-- row is modified. `IF NOT EXISTS` makes re-runs safe — some of these
-- may already exist on certain deployments (Supabase auto-suggests FK
-- indexes via the dashboard advisor too).
--
-- DATA SAFETY: indexes only. No row touched. The brief AccessShareLock
-- each CREATE INDEX takes is acceptable here because the app is
-- already failing queries against these tables.

-- ── RLS subquery lookups against the assignment tables ────────────────
-- The trainee-view policies on meal_plans/meals/foods/ingredients all
-- run `EXISTS (SELECT 1 FROM meal_plan_assignments WHERE meal_plan_id =
-- $foreign AND client_id = auth.uid())`. The existing
-- idx_meal_plan_assignments_client_date is (client_id, start_date) —
-- it doesn't cover lookups by `meal_plan_id`. Composite (meal_plan_id,
-- client_id) lets the subquery satisfy both predicates from index alone.
CREATE INDEX IF NOT EXISTS idx_meal_plan_assignments_plan_client
  ON meal_plan_assignments (meal_plan_id, client_id);

CREATE INDEX IF NOT EXISTS idx_workout_assignments_workout_client
  ON workout_assignments (workout_id, client_id);

-- ── FK indexes on the meal chain ──────────────────────────────────────
-- Used by both coach- and trainee-side RLS predicates that join
-- meals→meal_plans, foods→meals, ingredients→foods.
CREATE INDEX IF NOT EXISTS idx_meals_meal_plan
  ON meals (meal_plan_id);

CREATE INDEX IF NOT EXISTS idx_foods_meal
  ON foods (meal_id);

CREATE INDEX IF NOT EXISTS idx_ingredients_food
  ON ingredients (food_id);

-- ── FK indexes on the workout chain ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exercises_workout
  ON exercises (workout_id);

CREATE INDEX IF NOT EXISTS idx_exercise_sets_exercise
  ON exercise_sets (exercise_id);

-- ── coach-side ownership lookups ──────────────────────────────────────
-- The coach manage policies do `coach_id = auth.uid()` on meal_plans
-- and workouts. Library listings already filter by coach_id too, so
-- this is double-duty.
CREATE INDEX IF NOT EXISTS idx_meal_plans_coach
  ON meal_plans (coach_id);

CREATE INDEX IF NOT EXISTS idx_workouts_coach
  ON workouts (coach_id);

NOTIFY pgrst, 'reload schema';
