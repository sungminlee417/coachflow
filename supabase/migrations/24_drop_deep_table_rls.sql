-- Roll back the deep-table half of migration 21.
--
-- WHY
--
-- 21 enabled RLS + cascading policies on the full join chain so the
-- trainee daily fetch's PostgREST embed would still authorize through
-- every level. 22 added the supporting indexes. 23 wrapped `auth.uid()`
-- in `(SELECT auth.uid())` for planner caching.
--
-- Even with all three, the trainee fetch still hits the 8s statement
-- timeout on cold queries (future-date views that aren't cached). The
-- root cause is structural: a 4-deep `EXISTS` chain with JOINs at every
-- level (`ingredients → foods → meals → meal_plan_assignments`) is
-- fundamentally O(N×M×P×Q) per row evaluated, and the planner doesn't
-- have great options to flatten it.
--
-- This migration keeps RLS on the two assignment tables (cheap policies,
-- no JOINs, real security win) and disables RLS on the join-target
-- tables, restoring the pre-21 read path for those.
--
-- WHAT REMAINS PROTECTED
--   • meal_plan_assignments + workout_assignments still have RLS. Coach
--     owns own; client sees own. The most sensitive rows
--     (who-is-assigned-to-whom) stay locked down.
--
-- WHAT GOES BACK TO PRE-21 STATE
--   • meal_plans, meals, foods, ingredients, workouts, exercises,
--     exercise_sets — readable to any authenticated user via direct
--     PostgREST calls. This was the state from app inception through
--     migration 20.
--
-- NEXT STEPS (separate work, not this migration)
--   • SECURITY DEFINER RPC for the trainee daily payload — moves the
--     authz check to one place and returns the join in a single
--     non-RLS query. Allows re-enabling deep-table RLS later without
--     the perf cost.
--   • Or: denormalize `client_id` onto the deep tables and policy on
--     that single column.
--
-- DATA SAFETY: no row is read or modified. Only policy drops and RLS
-- toggle. The advisor warnings for these 7 tables will return — that's
-- a knowing trade for a working app.

-- ── meal_plans ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage their meal plans" ON meal_plans;
DROP POLICY IF EXISTS "clients view assigned meal plans" ON meal_plans;
ALTER TABLE meal_plans DISABLE ROW LEVEL SECURITY;

-- ── meals ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage meals in their plans" ON meals;
DROP POLICY IF EXISTS "clients view meals in assigned plans" ON meals;
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;

-- ── foods ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage foods in their plans" ON foods;
DROP POLICY IF EXISTS "clients view foods in assigned plans" ON foods;
ALTER TABLE foods DISABLE ROW LEVEL SECURITY;

-- ── ingredients ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage ingredients in their plans" ON ingredients;
DROP POLICY IF EXISTS "clients view ingredients in assigned plans" ON ingredients;
ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;

-- ── workouts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage their workouts" ON workouts;
DROP POLICY IF EXISTS "clients view assigned workouts" ON workouts;
ALTER TABLE workouts DISABLE ROW LEVEL SECURITY;

-- ── exercises ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage exercises in their workouts" ON exercises;
DROP POLICY IF EXISTS "clients view exercises in assigned workouts" ON exercises;
ALTER TABLE exercises DISABLE ROW LEVEL SECURITY;

-- ── exercise_sets ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "coaches manage sets in their workouts" ON exercise_sets;
DROP POLICY IF EXISTS "clients view sets in assigned workouts" ON exercise_sets;
ALTER TABLE exercise_sets DISABLE ROW LEVEL SECURITY;

-- The two assignment tables (meal_plan_assignments, workout_assignments)
-- intentionally KEEP their RLS + policies from 21 (auth.uid()-wrapped
-- via 23). Those policies are cheap — single equality check, no JOINs,
-- no perf concern.

NOTIFY pgrst, 'reload schema';
