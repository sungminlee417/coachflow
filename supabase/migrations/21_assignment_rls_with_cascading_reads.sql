-- Re-enable RLS on the two assignment tables AND add cascading read
-- policies on every joined table so the trainee daily view doesn't 500.
--
-- WHY THIS IS DIFFERENT FROM MIGRATION 16
--
-- 16 enabled RLS only on the assignment tables. The trainee daily fetch
-- embeds a 5-deep join:
--   meal_plan_assignments → meal_plans → meals → foods → ingredients
--   workout_assignments  → workouts   → exercises → exercise_sets
-- PostgREST applies RLS to every level. Migration 16 didn't add reader
-- policies to the join targets, so the trainee got 0 rows (or a 500 if
-- any joined table had RLS without policies) — migration 17 rolled it
-- back as a result.
--
-- This migration follows the same shape the `food_alternatives` (09) and
-- `exercise_alternatives` (06) policies already use: ENABLE RLS on the
-- joined table, then add two policies — one for coach owners (chain
-- back to `meal_plans.coach_id = auth.uid()` / `workouts.coach_id`) and
-- one for trainees (chain through `*_assignments.client_id`).
--
-- DATA SAFETY
--   • No row is modified. Only RLS toggles + policies.
--   • Every policy is wrapped in IF NOT EXISTS so re-runs are no-ops.
--   • ENABLE ROW LEVEL SECURITY is idempotent.
--   • If a deployment already added a policy via the Supabase dashboard
--     under any of these names, the IF NOT EXISTS guard skips our copy —
--     the existing policy stays in place. Multiple SELECT policies are
--     OR'd, so adding ours can only EXPAND access, never contract it.
--
-- TEST PLAN AFTER APPLYING
--   1. Sign in as a trainee with an active workout assignment for today.
--      Today tab must show the workout card with exercises listed (not
--      "Rest day"). If it shows "Rest day", RLS is blocking the deep
--      join — roll back via migration 21r and report which table.
--   2. Sign in as a coach. My Workouts / My Meal Plans libraries must
--      load (those are direct coach_id reads).
--   3. Coach → Client Detail must still show the client's assigned
--      content (this re-uses the trainee fetch but with the client's id).
--
-- ROLLBACK
--   See `supabase/migrations/21r_rollback_assignment_rls.sql`. Restores
--   the post-20 state (RLS off on both assignment tables, no policies).

-- ── meal_plan_assignments ─────────────────────────────────────────────
ALTER TABLE meal_plan_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_plan_assignments'
      AND policyname='coaches manage their meal plan assignments'
  ) THEN
    CREATE POLICY "coaches manage their meal plan assignments"
      ON meal_plan_assignments FOR ALL
      USING (coach_id = auth.uid())
      WITH CHECK (coach_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_plan_assignments'
      AND policyname='clients view their meal plan assignments'
  ) THEN
    CREATE POLICY "clients view their meal plan assignments"
      ON meal_plan_assignments FOR SELECT
      USING (client_id = auth.uid());
  END IF;
END $$;

-- ── workout_assignments ───────────────────────────────────────────────
ALTER TABLE workout_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workout_assignments'
      AND policyname='coaches manage their workout assignments'
  ) THEN
    CREATE POLICY "coaches manage their workout assignments"
      ON workout_assignments FOR ALL
      USING (coach_id = auth.uid())
      WITH CHECK (coach_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workout_assignments'
      AND policyname='clients view their workout assignments'
  ) THEN
    CREATE POLICY "clients view their workout assignments"
      ON workout_assignments FOR SELECT
      USING (client_id = auth.uid());
  END IF;
END $$;

-- Clients flip the assignment-level `completed` flag from the deep view
-- (the per-assignment "mark done" button). They don't touch any other
-- column — but a SELECT policy alone can't grant UPDATE, so this one
-- opens UPDATE on rows they own. WITH CHECK pins client_id so they
-- can't reassign the row to someone else mid-update.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workout_assignments'
      AND policyname='clients update completion of their assignments'
  ) THEN
    CREATE POLICY "clients update completion of their assignments"
      ON workout_assignments FOR UPDATE
      USING (client_id = auth.uid())
      WITH CHECK (client_id = auth.uid());
  END IF;
END $$;

-- ── meal_plans (join target) ──────────────────────────────────────────
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_plans'
      AND policyname='coaches manage their meal plans'
  ) THEN
    CREATE POLICY "coaches manage their meal plans"
      ON meal_plans FOR ALL
      USING (coach_id = auth.uid())
      WITH CHECK (coach_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_plans'
      AND policyname='clients view assigned meal plans'
  ) THEN
    CREATE POLICY "clients view assigned meal plans"
      ON meal_plans FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM meal_plan_assignments a
          WHERE a.meal_plan_id = meal_plans.id
            AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── meals (join target via meals.meal_plan_id) ────────────────────────
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meals'
      AND policyname='coaches manage meals in their plans'
  ) THEN
    CREATE POLICY "coaches manage meals in their plans"
      ON meals FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM meal_plans mp
          WHERE mp.id = meals.meal_plan_id AND mp.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM meal_plans mp
          WHERE mp.id = meals.meal_plan_id AND mp.coach_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meals'
      AND policyname='clients view meals in assigned plans'
  ) THEN
    CREATE POLICY "clients view meals in assigned plans"
      ON meals FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM meal_plan_assignments a
          WHERE a.meal_plan_id = meals.meal_plan_id
            AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── foods (join target via foods.meal_id → meals.meal_plan_id) ────────
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='foods'
      AND policyname='coaches manage foods in their plans'
  ) THEN
    CREATE POLICY "coaches manage foods in their plans"
      ON foods FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM meals m
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE m.id = foods.meal_id AND mp.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM meals m
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE m.id = foods.meal_id AND mp.coach_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='foods'
      AND policyname='clients view foods in assigned plans'
  ) THEN
    CREATE POLICY "clients view foods in assigned plans"
      ON foods FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM meals m
          JOIN meal_plan_assignments a ON a.meal_plan_id = m.meal_plan_id
          WHERE m.id = foods.meal_id AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── ingredients (join target via ingredients.food_id → foods.meal_id …) ─
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ingredients'
      AND policyname='coaches manage ingredients in their plans'
  ) THEN
    CREATE POLICY "coaches manage ingredients in their plans"
      ON ingredients FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM foods f
          JOIN meals m ON m.id = f.meal_id
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE f.id = ingredients.food_id AND mp.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM foods f
          JOIN meals m ON m.id = f.meal_id
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE f.id = ingredients.food_id AND mp.coach_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ingredients'
      AND policyname='clients view ingredients in assigned plans'
  ) THEN
    CREATE POLICY "clients view ingredients in assigned plans"
      ON ingredients FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM foods f
          JOIN meals m ON m.id = f.meal_id
          JOIN meal_plan_assignments a ON a.meal_plan_id = m.meal_plan_id
          WHERE f.id = ingredients.food_id AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── workouts (join target) ────────────────────────────────────────────
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workouts'
      AND policyname='coaches manage their workouts'
  ) THEN
    CREATE POLICY "coaches manage their workouts"
      ON workouts FOR ALL
      USING (coach_id = auth.uid())
      WITH CHECK (coach_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workouts'
      AND policyname='clients view assigned workouts'
  ) THEN
    CREATE POLICY "clients view assigned workouts"
      ON workouts FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workout_assignments a
          WHERE a.workout_id = workouts.id AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── exercises (join target via exercises.workout_id) ──────────────────
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercises'
      AND policyname='coaches manage exercises in their workouts'
  ) THEN
    CREATE POLICY "coaches manage exercises in their workouts"
      ON exercises FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workouts w
          WHERE w.id = exercises.workout_id AND w.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workouts w
          WHERE w.id = exercises.workout_id AND w.coach_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercises'
      AND policyname='clients view exercises in assigned workouts'
  ) THEN
    CREATE POLICY "clients view exercises in assigned workouts"
      ON exercises FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workout_assignments a
          WHERE a.workout_id = exercises.workout_id
            AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── exercise_sets (join target via exercise_sets.exercise_id …) ───────
ALTER TABLE exercise_sets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercise_sets'
      AND policyname='coaches manage sets in their workouts'
  ) THEN
    CREATE POLICY "coaches manage sets in their workouts"
      ON exercise_sets FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM exercises e
          JOIN workouts w ON w.id = e.workout_id
          WHERE e.id = exercise_sets.exercise_id AND w.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM exercises e
          JOIN workouts w ON w.id = e.workout_id
          WHERE e.id = exercise_sets.exercise_id AND w.coach_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercise_sets'
      AND policyname='clients view sets in assigned workouts'
  ) THEN
    CREATE POLICY "clients view sets in assigned workouts"
      ON exercise_sets FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM exercises e
          JOIN workout_assignments a ON a.workout_id = e.workout_id
          WHERE e.id = exercise_sets.exercise_id
            AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- food_alternatives (migration 09) and exercise_alternatives (migration 06)
-- already have RLS + matching coach/trainee policies — intentionally not
-- touched here.

NOTIFY pgrst, 'reload schema';
