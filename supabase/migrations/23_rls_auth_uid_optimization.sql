-- Rewrite every RLS policy from migration 21 to wrap `auth.uid()` in
-- `(SELECT auth.uid())`. This is Supabase's documented #1 RLS perf
-- fix — without the SELECT wrapper, Postgres re-evaluates `auth.uid()`
-- per row (because it's marked STABLE, not IMMUTABLE), which on a 4-deep
-- EXISTS chain like `ingredients → foods → meals → meal_plan_assignments`
-- means the JWT lookup runs N×M×P times per query and the planner can't
-- hoist it. Wrapping it in a scalar subquery lets the planner cache the
-- result once per query, often turning a 10s timeout into a 50ms read.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- This migration is a strict drop-and-recreate of every policy 21
-- created, with identical predicates except for the auth.uid() wrap.
-- Behavior is unchanged; only performance improves.
--
-- DATA SAFETY: no row is read or modified. Each policy is dropped and
-- immediately recreated within the same statement-pair, so there is no
-- window where a table is left with no policies (Postgres treats RLS
-- as deny-by-default, so a gap would 0-row reads — but DROP+CREATE in
-- sequence is fast enough that the gap is sub-millisecond, and in
-- practice the only readers are end users who would just retry).

-- ── meal_plan_assignments ─────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage their meal plan assignments" ON meal_plan_assignments;
CREATE POLICY "coaches manage their meal plan assignments"
  ON meal_plan_assignments FOR ALL
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "clients view their meal plan assignments" ON meal_plan_assignments;
CREATE POLICY "clients view their meal plan assignments"
  ON meal_plan_assignments FOR SELECT
  USING (client_id = (SELECT auth.uid()));

-- ── workout_assignments ───────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage their workout assignments" ON workout_assignments;
CREATE POLICY "coaches manage their workout assignments"
  ON workout_assignments FOR ALL
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "clients view their workout assignments" ON workout_assignments;
CREATE POLICY "clients view their workout assignments"
  ON workout_assignments FOR SELECT
  USING (client_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "clients update completion of their assignments" ON workout_assignments;
CREATE POLICY "clients update completion of their assignments"
  ON workout_assignments FOR UPDATE
  USING (client_id = (SELECT auth.uid()))
  WITH CHECK (client_id = (SELECT auth.uid()));

-- ── meal_plans ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage their meal plans" ON meal_plans;
CREATE POLICY "coaches manage their meal plans"
  ON meal_plans FOR ALL
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "clients view assigned meal plans" ON meal_plans;
CREATE POLICY "clients view assigned meal plans"
  ON meal_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meal_plan_assignments a
      WHERE a.meal_plan_id = meal_plans.id
        AND a.client_id = (SELECT auth.uid())
    )
  );

-- ── meals ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage meals in their plans" ON meals;
CREATE POLICY "coaches manage meals in their plans"
  ON meals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM meal_plans mp
      WHERE mp.id = meals.meal_plan_id AND mp.coach_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meal_plans mp
      WHERE mp.id = meals.meal_plan_id AND mp.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "clients view meals in assigned plans" ON meals;
CREATE POLICY "clients view meals in assigned plans"
  ON meals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meal_plan_assignments a
      WHERE a.meal_plan_id = meals.meal_plan_id
        AND a.client_id = (SELECT auth.uid())
    )
  );

-- ── foods ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage foods in their plans" ON foods;
CREATE POLICY "coaches manage foods in their plans"
  ON foods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN meal_plans mp ON mp.id = m.meal_plan_id
      WHERE m.id = foods.meal_id AND mp.coach_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN meal_plans mp ON mp.id = m.meal_plan_id
      WHERE m.id = foods.meal_id AND mp.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "clients view foods in assigned plans" ON foods;
CREATE POLICY "clients view foods in assigned plans"
  ON foods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meals m
      JOIN meal_plan_assignments a ON a.meal_plan_id = m.meal_plan_id
      WHERE m.id = foods.meal_id AND a.client_id = (SELECT auth.uid())
    )
  );

-- ── ingredients ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage ingredients in their plans" ON ingredients;
CREATE POLICY "coaches manage ingredients in their plans"
  ON ingredients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM foods f
      JOIN meals m ON m.id = f.meal_id
      JOIN meal_plans mp ON mp.id = m.meal_plan_id
      WHERE f.id = ingredients.food_id AND mp.coach_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM foods f
      JOIN meals m ON m.id = f.meal_id
      JOIN meal_plans mp ON mp.id = m.meal_plan_id
      WHERE f.id = ingredients.food_id AND mp.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "clients view ingredients in assigned plans" ON ingredients;
CREATE POLICY "clients view ingredients in assigned plans"
  ON ingredients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM foods f
      JOIN meals m ON m.id = f.meal_id
      JOIN meal_plan_assignments a ON a.meal_plan_id = m.meal_plan_id
      WHERE f.id = ingredients.food_id AND a.client_id = (SELECT auth.uid())
    )
  );

-- ── workouts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage their workouts" ON workouts;
CREATE POLICY "coaches manage their workouts"
  ON workouts FOR ALL
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "clients view assigned workouts" ON workouts;
CREATE POLICY "clients view assigned workouts"
  ON workouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workout_assignments a
      WHERE a.workout_id = workouts.id AND a.client_id = (SELECT auth.uid())
    )
  );

-- ── exercises ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage exercises in their workouts" ON exercises;
CREATE POLICY "coaches manage exercises in their workouts"
  ON exercises FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = exercises.workout_id AND w.coach_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = exercises.workout_id AND w.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "clients view exercises in assigned workouts" ON exercises;
CREATE POLICY "clients view exercises in assigned workouts"
  ON exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workout_assignments a
      WHERE a.workout_id = exercises.workout_id
        AND a.client_id = (SELECT auth.uid())
    )
  );

-- ── exercise_sets ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage sets in their workouts" ON exercise_sets;
CREATE POLICY "coaches manage sets in their workouts"
  ON exercise_sets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM exercises e
      JOIN workouts w ON w.id = e.workout_id
      WHERE e.id = exercise_sets.exercise_id AND w.coach_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exercises e
      JOIN workouts w ON w.id = e.workout_id
      WHERE e.id = exercise_sets.exercise_id AND w.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "clients view sets in assigned workouts" ON exercise_sets;
CREATE POLICY "clients view sets in assigned workouts"
  ON exercise_sets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM exercises e
      JOIN workout_assignments a ON a.workout_id = e.workout_id
      WHERE e.id = exercise_sets.exercise_id
        AND a.client_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
