-- Roll back the RLS enables that migration 16 turned on for the two
-- assignment tables. Reports came in of `meal_plan_assignments` returning
-- a 500 from PostgREST on the trainee daily view after 16 shipped: the
-- existing schema had no RLS on those tables (so reads were unrestricted),
-- and the policies migration 16 added — coach manage + client view — turn
-- out to be too narrow once the embedded join to `meal_plans` is involved
-- (PostgREST follows RLS down the relation, and `meal_plans` didn't get a
-- matching trainee-read path).
--
-- Safer behavior: leave RLS *off* on these tables in the public schema
-- (which is how the app worked before 16) and let the assignment-row
-- ownership be enforced by the client-side queries plus the foreign-key
-- ownership on `workouts` / `meal_plans` themselves.
--
-- DATA SAFETY: this is purely a permissions relaxation. No row is modified.
-- The previously-running trainee + coach flows go back to working as they
-- did before 16. The other RLS policies migration 16 added (user logs,
-- profiles, invite_codes) stay in place — those tables don't have the
-- deep-join problem and the audit found real value in tightening them.
--
-- Re-enabling RLS on these tables later is fine, but only with a matching
-- SELECT policy on every joined table along the path:
--   meal_plan_assignments → meal_plans → meals → foods → ingredients
--   workout_assignments  → workouts   → exercises → exercise_sets
--                                                → exercise_alternatives
-- The cleanest path is a `SECURITY DEFINER` RPC that returns the full
-- daily payload — same pattern recommended in migration 16's comment
-- for invite redemption.

ALTER TABLE meal_plan_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE workout_assignments DISABLE ROW LEVEL SECURITY;

-- Drop the policies we added in 16 too — leaving them attached to a
-- disabled-RLS table is harmless but confusing for anyone reading the
-- schema later.
DROP POLICY IF EXISTS "coaches manage their meal plan assignments"
  ON meal_plan_assignments;
DROP POLICY IF EXISTS "clients view their meal plan assignments"
  ON meal_plan_assignments;
DROP POLICY IF EXISTS "coaches manage their workout assignments"
  ON workout_assignments;
DROP POLICY IF EXISTS "clients view their workout assignments"
  ON workout_assignments;

NOTIFY pgrst, 'reload schema';
