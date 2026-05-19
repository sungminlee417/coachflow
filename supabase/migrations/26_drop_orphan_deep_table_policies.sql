-- Drop orphan policies on every "deep-chain" table that migration 24
-- disabled RLS on.
--
-- HISTORY
--   • 21 enabled RLS + added coach/client policies on the entire join
--     chain (meal_plan_assignments → meal_plans → meals → foods →
--     ingredients, plus workout_assignments → workouts → exercises →
--     exercise_sets). 22 added supporting indexes. 23 wrapped
--     `auth.uid()` in `(SELECT auth.uid())` for planner caching.
--   • 24 explicitly DISABLED RLS on the seven non-assignment tables
--     (meal_plans, meals, foods, ingredients, workouts, exercises,
--     exercise_sets) because the PostgREST embedded join still hit the
--     8s statement timeout on cold queries. A 4-deep EXISTS chain with
--     JOINs at every level doesn't flatten well enough for the planner.
--   • Since 24 shipped, dashboard-added policies (capital-C names,
--     slightly varying phrasing) have attached themselves to these
--     tables — likely via the advisor's "quick fix" suggestion. RLS is
--     still off so those policies enforce nothing, but the advisor
--     (correctly) flags the "policy exists, RLS off" state.
--
-- This migration restores the post-24 state: zero policies attached on
-- any of the seven, RLS still disabled. Authorization continues to rely
-- on client-side filters + the RLS-protected assignment tables, same
-- model the app has used since inception.
--
-- DATA SAFETY
--   • No row is read or modified. Only metadata changes.
--   • Dropping a policy on an RLS-disabled table has zero behavioral
--     effect — the policy wasn't being enforced.
--   • Every DROP is `IF EXISTS` so this is safe to re-run.
--   • DISABLE ROW LEVEL SECURITY is a no-op if RLS is already off.

-- ── re-assert the disabled state in case the dashboard re-enabled RLS ─
ALTER TABLE meal_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE foods DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE workouts DISABLE ROW LEVEL SECURITY;
ALTER TABLE exercises DISABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_sets DISABLE ROW LEVEL SECURITY;

-- ── dashboard-added policy names (capital-C, "can view" / "in their") ─
-- Drop every variation the wizard might have generated. IF EXISTS keeps
-- this safe on any environment regardless of which subset was applied.

-- meal_plans
DROP POLICY IF EXISTS "Clients view their assigned meal plans" ON meal_plans;
DROP POLICY IF EXISTS "Clients can view assigned meal plans" ON meal_plans;
DROP POLICY IF EXISTS "Clients can view their assigned meal plans" ON meal_plans;
DROP POLICY IF EXISTS "Clients can view meal plans assigned to them" ON meal_plans;
DROP POLICY IF EXISTS "Coaches manage their meal plans" ON meal_plans;
DROP POLICY IF EXISTS "Coaches can manage their meal plans" ON meal_plans;
DROP POLICY IF EXISTS "Coaches can manage their own meal plans" ON meal_plans;

-- meals
DROP POLICY IF EXISTS "Clients view meals in their assigned plans" ON meals;
DROP POLICY IF EXISTS "Clients can view meals in assigned plans" ON meals;
DROP POLICY IF EXISTS "Clients can view meals in assigned meal plans" ON meals;
DROP POLICY IF EXISTS "Coaches manage meals in their plans" ON meals;
DROP POLICY IF EXISTS "Coaches can manage meals in their plans" ON meals;
DROP POLICY IF EXISTS "Coaches can manage meals in their meal plans" ON meals;

-- foods
DROP POLICY IF EXISTS "Clients view foods in their assigned meal plans" ON foods;
DROP POLICY IF EXISTS "Clients can view foods in assigned plans" ON foods;
DROP POLICY IF EXISTS "Coaches manage foods in their meal plans" ON foods;
DROP POLICY IF EXISTS "Coaches can manage foods in their plans" ON foods;

-- ingredients
DROP POLICY IF EXISTS "Clients view ingredients in their assigned meal plans" ON ingredients;
DROP POLICY IF EXISTS "Clients can view ingredients in assigned plans" ON ingredients;
DROP POLICY IF EXISTS "Coaches manage ingredients in their meal plans" ON ingredients;
DROP POLICY IF EXISTS "Coaches can manage ingredients in their plans" ON ingredients;

-- workouts
DROP POLICY IF EXISTS "Clients view assigned workouts" ON workouts;
DROP POLICY IF EXISTS "Clients can view assigned workouts" ON workouts;
DROP POLICY IF EXISTS "Clients can view workouts assigned to them" ON workouts;
DROP POLICY IF EXISTS "Coaches manage their workouts" ON workouts;
DROP POLICY IF EXISTS "Coaches can manage their workouts" ON workouts;
DROP POLICY IF EXISTS "Coaches can manage their own workouts" ON workouts;

-- exercises
DROP POLICY IF EXISTS "Clients view exercises in assigned workouts" ON exercises;
DROP POLICY IF EXISTS "Clients can view exercises in assigned workouts" ON exercises;
DROP POLICY IF EXISTS "Coaches manage exercises in their workouts" ON exercises;
DROP POLICY IF EXISTS "Coaches can manage exercises in their workouts" ON exercises;

-- exercise_sets
DROP POLICY IF EXISTS "Clients view exercise_sets in assigned workouts" ON exercise_sets;
DROP POLICY IF EXISTS "Clients can view exercise_sets in assigned workouts" ON exercise_sets;
DROP POLICY IF EXISTS "Clients view sets in assigned workouts" ON exercise_sets;
DROP POLICY IF EXISTS "Coaches manage exercise_sets" ON exercise_sets;
DROP POLICY IF EXISTS "Coaches can manage exercise_sets" ON exercise_sets;
DROP POLICY IF EXISTS "Coaches manage sets in their workouts" ON exercise_sets;

-- ── also drop the migration-21 (lowercase) names in case any deployment ─
-- still carries them. Migration 24 already dropped these, but `IF EXISTS`
-- keeps this safe on mixed-state environments.
DROP POLICY IF EXISTS "coaches manage their meal plans" ON meal_plans;
DROP POLICY IF EXISTS "clients view assigned meal plans" ON meal_plans;
DROP POLICY IF EXISTS "coaches manage meals in their plans" ON meals;
DROP POLICY IF EXISTS "clients view meals in assigned plans" ON meals;
DROP POLICY IF EXISTS "coaches manage foods in their plans" ON foods;
DROP POLICY IF EXISTS "clients view foods in assigned plans" ON foods;
DROP POLICY IF EXISTS "coaches manage ingredients in their plans" ON ingredients;
DROP POLICY IF EXISTS "clients view ingredients in assigned plans" ON ingredients;
DROP POLICY IF EXISTS "coaches manage their workouts" ON workouts;
DROP POLICY IF EXISTS "clients view assigned workouts" ON workouts;
DROP POLICY IF EXISTS "coaches manage exercises in their workouts" ON exercises;
DROP POLICY IF EXISTS "clients view exercises in assigned workouts" ON exercises;
DROP POLICY IF EXISTS "coaches manage sets in their workouts" ON exercise_sets;
DROP POLICY IF EXISTS "clients view sets in assigned workouts" ON exercise_sets;

NOTIFY pgrst, 'reload schema';
