-- The proper fix for the long-running RLS / advisor saga.
--
-- WHY THIS MIGRATION EXISTS
--
-- Migrations 21–24 cycled through enabling RLS on the deep-chain tables
-- (meal_plans / meals / foods / ingredients and workouts / exercises /
-- exercise_sets), discovering the PostgREST embedded join with cascading
-- `EXISTS` policies hit the 8s statement timeout, then rolling back to
-- RLS-off on those tables. That left:
--   • the advisor flagging "RLS Disabled in Public" on 7 tables, and
--   • the actual authz model relying on client-side filters + the
--     RLS-protected assignment tables.
--
-- The right architectural fix is to move the trainee's deep fetch off
-- PostgREST embeds and onto two SECURITY DEFINER RPCs that join inside
-- Postgres without going through RLS. Once those exist, the deep-chain
-- tables can have RLS turned back on with simple coach-owner policies
-- — coaches keep reading their libraries via direct PostgREST queries,
-- trainees read assigned content via the RPCs, and the advisor stops
-- complaining.
--
-- The functions are OWNED by the migration runner (typically `postgres`,
-- which carries `bypassrls`) and marked `SECURITY DEFINER`, so the SQL
-- inside the function body executes with that owner's privileges. The
-- functions themselves do their own authorization: caller must equal
-- `p_client_id`, OR caller must be a coach with an active
-- `coach_client_relationships` row to that client. Other callers get an
-- empty array — no leakage.
--
-- DATA SAFETY
--   • No row is read or modified by this migration. Only function
--     creation + RLS toggle + policy creation.
--   • Function bodies are pure SELECTs (`STABLE`), no DML.
--   • Policies are coach-only writes/reads — they precisely match the
--     pattern the rest of the codebase already enforces in client-side
--     queries (filter by `coach_id = self`).
--   • If a deployment somehow still has dashboard-added policies
--     attached on these tables, they'll be ignored once RLS is on AND
--     the new policies are present, because multiple SELECT policies
--     OR together (and the dashboard ones generally only EXPAND access,
--     never block it).
--   • `CREATE OR REPLACE FUNCTION` makes function creation idempotent.
--     Policy creation is wrapped in DO blocks with NOT EXISTS guards.

-- ─────────────────────────────────────────────────────────────────────
-- 1. RPC: trainee daily workout assignments
-- ─────────────────────────────────────────────────────────────────────
-- Returns a JSONB array shaped exactly like the previous PostgREST embed
-- so the client-side mapping in `lib/queries.ts` doesn't change. The
-- caller is identified by `auth.uid()` and must be authorized for the
-- requested `p_client_id`.

CREATE OR REPLACE FUNCTION public.get_active_workout_assignments(
  p_client_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
-- Lock the search path so a malicious schema in the user's path can't
-- shadow `public.coach_client_relationships` or any of the joined
-- tables. Recommended for every SECURITY DEFINER function in Supabase.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Anonymous callers never get rows.
  IF v_caller IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Caller must be the trainee themselves OR a coach with an active
  -- relationship to the trainee. Self-coaching (coach_id = client_id)
  -- passes the first branch.
  IF v_caller <> p_client_id AND NOT EXISTS (
    SELECT 1
    FROM coach_client_relationships
    WHERE coach_id = v_caller
      AND client_id = p_client_id
      AND status = 'active'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', wa.id,
        'start_date', wa.start_date,
        'end_date', wa.end_date,
        'completed', wa.completed,
        'completed_at', wa.completed_at,
        'notes', wa.notes,
        'coach_id', wa.coach_id,
        'cycle_anchor_date', wa.cycle_anchor_date,
        'workout', jsonb_build_object(
          'id', w.id,
          'name', w.name,
          'description', w.description,
          'days_of_week', w.days_of_week,
          'cycle_length', w.cycle_length,
          'cycle_position', w.cycle_position,
          'exercises', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', e.id,
                'name', e.name,
                'exercise_type', e.exercise_type,
                'sets', e.sets,
                'reps', e.reps,
                'weight', e.weight,
                'rest_seconds', e.rest_seconds,
                'notes', e.notes,
                'order_index', e.order_index,
                'pair_with_next', e.pair_with_next,
                'cardio_subtype', e.cardio_subtype,
                'exercise_sets', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', es.id,
                      'set_number', es.set_number,
                      'target_reps', es.target_reps,
                      'target_duration_seconds', es.target_duration_seconds,
                      'notes', es.notes,
                      'target_speed', es.target_speed,
                      'target_incline', es.target_incline,
                      'target_resistance', es.target_resistance
                    )
                    ORDER BY es.set_number
                  )
                  FROM exercise_sets es
                  WHERE es.exercise_id = e.id
                ), '[]'::jsonb),
                'exercise_alternatives', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', ea.id,
                      'name', ea.name,
                      'order_index', ea.order_index
                    )
                    ORDER BY ea.order_index
                  )
                  FROM exercise_alternatives ea
                  WHERE ea.exercise_id = e.id
                ), '[]'::jsonb)
              )
              ORDER BY e.order_index
            )
            FROM exercises e
            WHERE e.workout_id = w.id
          ), '[]'::jsonb)
        )
      )
    )
    FROM workout_assignments wa
    JOIN workouts w ON w.id = wa.workout_id
    WHERE wa.client_id = p_client_id
      AND (wa.start_date IS NULL OR wa.start_date <= p_date)
      AND (wa.end_date IS NULL OR wa.end_date >= p_date)
  ), '[]'::jsonb);
END;
$$;

-- Anonymous users have no business calling this — `authenticated` only.
REVOKE ALL ON FUNCTION public.get_active_workout_assignments(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_workout_assignments(uuid, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. RPC: trainee daily meal-plan assignments
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_active_meal_plan_assignments(
  p_client_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_caller <> p_client_id AND NOT EXISTS (
    SELECT 1
    FROM coach_client_relationships
    WHERE coach_id = v_caller
      AND client_id = p_client_id
      AND status = 'active'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', mpa.id,
        'start_date', mpa.start_date,
        'end_date', mpa.end_date,
        'notes', mpa.notes,
        'coach_id', mpa.coach_id,
        'meal_plan', jsonb_build_object(
          'id', mp.id,
          'name', mp.name,
          'description', mp.description,
          'meals', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', m.id,
                'meal_type', m.meal_type,
                'name', m.name,
                'description', m.description,
                'days_of_week', m.days_of_week,
                'time', m.time,
                'order_index', m.order_index,
                'foods', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', f.id,
                      'name', f.name,
                      'quantity', f.quantity,
                      'calories', f.calories,
                      'protein_grams', f.protein_grams,
                      'carbs_grams', f.carbs_grams,
                      'fat_grams', f.fat_grams,
                      'order_index', f.order_index,
                      'ingredients', COALESCE((
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', i.id,
                            'name', i.name,
                            'quantity', i.quantity,
                            'calories', i.calories,
                            'protein_grams', i.protein_grams,
                            'carbs_grams', i.carbs_grams,
                            'fat_grams', i.fat_grams,
                            'order_index', i.order_index
                          )
                          ORDER BY i.order_index
                        )
                        FROM ingredients i
                        WHERE i.food_id = f.id
                      ), '[]'::jsonb),
                      'food_alternatives', COALESCE((
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', fa.id,
                            'name', fa.name,
                            'quantity', fa.quantity,
                            'calories', fa.calories,
                            'protein_grams', fa.protein_grams,
                            'carbs_grams', fa.carbs_grams,
                            'fat_grams', fa.fat_grams,
                            'order_index', fa.order_index
                          )
                          ORDER BY fa.order_index
                        )
                        FROM food_alternatives fa
                        WHERE fa.food_id = f.id
                      ), '[]'::jsonb)
                    )
                    ORDER BY f.order_index
                  )
                  FROM foods f
                  WHERE f.meal_id = m.id
                ), '[]'::jsonb)
              )
              ORDER BY m.order_index
            )
            FROM meals m
            WHERE m.meal_plan_id = mp.id
          ), '[]'::jsonb)
        )
      )
    )
    FROM meal_plan_assignments mpa
    JOIN meal_plans mp ON mp.id = mpa.meal_plan_id
    WHERE mpa.client_id = p_client_id
      AND (mpa.start_date IS NULL OR mpa.start_date <= p_date)
      AND (mpa.end_date IS NULL OR mpa.end_date >= p_date)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_meal_plan_assignments(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_meal_plan_assignments(uuid, date) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Enable RLS on the 7 deep-chain tables
-- ─────────────────────────────────────────────────────────────────────
-- With the RPCs above bypassing RLS internally (SECURITY DEFINER +
-- bypassrls owner), the deep-chain tables can have RLS turned back on
-- without breaking the trainee daily view.
--
-- The coach-side reads (My Workouts library, MealPlanBuilder embed,
-- WorkoutBuilder embed, ClientDetailView assignment list) still go
-- through direct PostgREST queries — those need the policies below.

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_sets ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Coach-owner policies
-- ─────────────────────────────────────────────────────────────────────
-- Identical shape to what migration 21 had, except:
--   • No trainee SELECT branch — trainees go through the RPC instead.
--   • `auth.uid()` is wrapped in `(SELECT auth.uid())` so the planner
--     caches the value per query (the migration 23 optimization).
--   • Names match the migration 21 naming so re-runs and existing
--     deployments stay consistent.

-- meal_plans
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_plans'
      AND policyname='coaches manage their meal plans'
  ) THEN
    CREATE POLICY "coaches manage their meal plans"
      ON meal_plans FOR ALL
      USING (coach_id = (SELECT auth.uid()))
      WITH CHECK (coach_id = (SELECT auth.uid()));
  END IF;
END $$;

-- meals — own via the parent meal_plan's coach.
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
          WHERE mp.id = meals.meal_plan_id
            AND mp.coach_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM meal_plans mp
          WHERE mp.id = meals.meal_plan_id
            AND mp.coach_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- foods — own via meals → meal_plans.
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
          WHERE m.id = foods.meal_id
            AND mp.coach_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM meals m
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE m.id = foods.meal_id
            AND mp.coach_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- ingredients — own via foods → meals → meal_plans.
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
          WHERE f.id = ingredients.food_id
            AND mp.coach_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM foods f
          JOIN meals m ON m.id = f.meal_id
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE f.id = ingredients.food_id
            AND mp.coach_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- workouts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workouts'
      AND policyname='coaches manage their workouts'
  ) THEN
    CREATE POLICY "coaches manage their workouts"
      ON workouts FOR ALL
      USING (coach_id = (SELECT auth.uid()))
      WITH CHECK (coach_id = (SELECT auth.uid()));
  END IF;
END $$;

-- exercises — own via parent workout's coach.
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
          WHERE w.id = exercises.workout_id
            AND w.coach_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workouts w
          WHERE w.id = exercises.workout_id
            AND w.coach_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- exercise_sets — own via exercises → workouts.
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
          WHERE e.id = exercise_sets.exercise_id
            AND w.coach_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM exercises e
          JOIN workouts w ON w.id = e.workout_id
          WHERE e.id = exercise_sets.exercise_id
            AND w.coach_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
