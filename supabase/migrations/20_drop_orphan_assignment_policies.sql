-- Drop orphan policies on the two assignment tables.
--
-- HISTORY:
--   • Migration 16 enabled RLS on `meal_plan_assignments` /
--     `workout_assignments` and added coach-manage + client-view policies.
--   • Migration 17 explicitly DISABLED RLS on both tables and dropped
--     those policies, because the trainee daily view embeds joins through
--     `meal_plan_assignments → meal_plans → meals → foods → ingredients`
--     (and the equivalent workout chain). PostgREST applies RLS down the
--     relation, and the joined tables had no matching read policies, so
--     the daily view started 500-ing.
--   • Since then, *new* policies with different names (likely added via
--     the Supabase dashboard's "quick fix" wizard) attached themselves to
--     these tables. RLS is still off — those policies enforce nothing —
--     but the advisor (correctly) flags the "policy exists, RLS off"
--     state as suspicious.
--
-- This migration restores the post-17 state: no policies attached, RLS
-- disabled. Defense-in-depth at the DB level for these tables would
-- require either (a) policies on the entire join chain or (b) moving the
-- trainee daily fetch to a SECURITY DEFINER RPC — both deliberately
-- deferred per migration 17's recommendation.
--
-- DATA SAFETY: no row is read or modified. Dropping a policy on an
-- RLS-disabled table is a metadata-only change with zero behavioral
-- effect (the policies weren't being enforced anyway).

-- Belt-and-suspenders: re-assert the disabled state so this migration is
-- safe to run against a project where someone re-enabled RLS through the
-- dashboard since 17 shipped.
ALTER TABLE meal_plan_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE workout_assignments DISABLE ROW LEVEL SECURITY;

-- Drop the dashboard-added policies that triggered the advisor warning.
-- `IF EXISTS` makes this a no-op on a clean schema where they were never
-- created in the first place.
DROP POLICY IF EXISTS "Clients can view their meal plan assignments"
  ON meal_plan_assignments;
DROP POLICY IF EXISTS "Coaches can manage meal plan assignments for their clients"
  ON meal_plan_assignments;

DROP POLICY IF EXISTS "Clients can view their workout assignments"
  ON workout_assignments;
DROP POLICY IF EXISTS "Clients can update completion status of their assignments"
  ON workout_assignments;
DROP POLICY IF EXISTS "Coaches can manage workout assignments for their clients"
  ON workout_assignments;

-- Also drop the original (lowercase) names from migration 16 in case any
-- environment has a mixed state — same IF EXISTS no-op safety.
DROP POLICY IF EXISTS "coaches manage their meal plan assignments"
  ON meal_plan_assignments;
DROP POLICY IF EXISTS "clients view their meal plan assignments"
  ON meal_plan_assignments;
DROP POLICY IF EXISTS "coaches manage their workout assignments"
  ON workout_assignments;
DROP POLICY IF EXISTS "clients view their workout assignments"
  ON workout_assignments;

NOTIFY pgrst, 'reload schema';
