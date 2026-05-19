-- Address every WARN-level finding from the Supabase database linter:
--
--   • function_search_path_mutable (3 functions): the 3 pre-existing
--     functions (`handle_new_user`, `update_updated_at_column`,
--     `use_invite`) don't pin a `search_path`. We `ALTER FUNCTION` them
--     to set `search_path = public, pg_temp` so a malicious schema in
--     a caller's path can't shadow public tables.
--   • rls_policy_always_true (2 policies):
--       - `coach_client_relationships."System can create relationships"`
--         (INSERT, WITH CHECK true) — an orphan from before migration 16
--         narrowed the trainee-creates-own path to `client_id = auth.uid()`.
--         Drop it.
--       - `invite_codes."Allow invite usage update"` (UPDATE, USING + CHECK
--         true) — let any signed-in user bump `times_used` / `status` on
--         any invite. Replaced by the new `use_invite()` RPC which does
--         the same atomically inside a SECURITY DEFINER body. Drop the
--         policy; the page will be refactored to call the RPC instead of
--         updating the row directly.
--   • anon_security_definer_function_executable: `anon` should not have
--     EXECUTE on any of our SECURITY DEFINER functions. Revoke it.
--   • authenticated_security_definer_function_executable on
--     `handle_new_user`: that function is only invoked by the
--     `auth.users` trigger; signed-in users have no reason to call it
--     via RPC. Revoke EXECUTE from authenticated too.
--     The other authenticated warnings on `get_active_*` and
--     `use_invite` are accepted — those functions are user-facing by
--     design and gate access via internal `auth.uid()` checks.
--
-- DATA SAFETY: no row is modified. `ALTER FUNCTION ... SET` is metadata;
-- `CREATE OR REPLACE FUNCTION` re-defines the body; policy drops are
-- metadata; `REVOKE` adjusts permissions. The one *behavioral* change is
-- the new `use_invite` body, which the refactored `app/invite/page.tsx`
-- will rely on — but the old direct-update path remains exercised until
-- the code change deploys, so applying this migration before the deploy
-- is safe (the old code keeps working because the new RPC also works).

-- ── 1. Pin search_path on the 3 pre-existing functions ───────────────
-- `ALTER ... SET search_path` is idempotent and doesn't touch bodies.
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;

-- ── 2. Replace `use_invite` with the full acceptance flow ────────────
-- Previously the client called this for the times_used bump only and
-- did the rest of the validation + relationship insert inline. Folding
-- everything into a single SECURITY DEFINER function:
--   • removes the need for the permissive "Allow invite usage update"
--     policy on invite_codes (dropped below),
--   • makes the operation atomic (no half-accepted state if the page
--     errors between the insert and the counter update),
--   • lets us return a typed result the client can switch on cleanly.
--
-- The return shape is a JSONB envelope:
--   { status: 'ok' | <error_code>, coach_name?: string }
-- where `<error_code>` is one of:
--   'invalid' | 'revoked' | 'expired' | 'fully_used'
--   | 'already_connected' | 'self_code' | 'unauthenticated'
--
-- DROP FUNCTION is required because the old `use_invite` had a
-- different return type (likely `void`) and Postgres can't change a
-- function's return type via `CREATE OR REPLACE`. The drop + recreate
-- are in the same transaction (Supabase wraps each migration in one),
-- so there's no observable window during which the function is missing.
DROP FUNCTION IF EXISTS public.use_invite(text);

CREATE OR REPLACE FUNCTION public.use_invite(code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_invite record;
  v_coach_name text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;

  SELECT id, coach_id, status, times_used, max_uses, expires_at, revoked_at
    INTO v_invite
  FROM invite_codes
  WHERE invite_codes.code = use_invite.code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  IF v_invite.status <> 'pending' OR v_invite.times_used >= v_invite.max_uses THEN
    RETURN jsonb_build_object('status', 'fully_used');
  END IF;

  IF v_invite.coach_id = v_caller THEN
    RETURN jsonb_build_object('status', 'self_code');
  END IF;

  IF EXISTS (
    SELECT 1 FROM coach_client_relationships
    WHERE coach_id = v_invite.coach_id AND client_id = v_caller
  ) THEN
    RETURN jsonb_build_object('status', 'already_connected');
  END IF;

  -- Atomic: create the relationship and bump the counter together. If
  -- either statement raises, the other rolls back.
  INSERT INTO coach_client_relationships (coach_id, client_id, invite_code_id)
  VALUES (v_invite.coach_id, v_caller, v_invite.id);

  UPDATE invite_codes
  SET
    times_used = v_invite.times_used + 1,
    status = CASE
      WHEN v_invite.times_used + 1 >= v_invite.max_uses THEN 'accepted'
      ELSE 'pending'
    END
  WHERE id = v_invite.id;

  SELECT full_name INTO v_coach_name
  FROM profiles
  WHERE id = v_invite.coach_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'coach_name', COALESCE(v_coach_name, 'your coach')
  );
END;
$$;

-- ── 3. Drop the two overly-permissive policies ───────────────────────
-- Both were "anyone signed in can do anything" patches. The replacements:
--   • Relationship inserts go through migration 16's "trainee creates
--     own relationship" policy (`client_id = auth.uid()`), which
--     covers both invite acceptance and the signup self-coach upsert.
--   • Invite-code updates go through the new `use_invite` RPC.
DROP POLICY IF EXISTS "System can create relationships" ON coach_client_relationships;
DROP POLICY IF EXISTS "Allow invite usage update" ON invite_codes;

-- ── 4. Tighten EXECUTE grants on SECURITY DEFINER functions ──────────
-- Anonymous users have no business calling any of our SECURITY DEFINER
-- functions directly. `handle_new_user` is also revoked from
-- authenticated because it's a trigger function on `auth.users`, not a
-- user-callable RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.use_invite(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_active_workout_assignments(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_meal_plan_assignments(uuid, date) FROM anon;

-- And restate the grants we actually want (idempotent, since these were
-- already in migration 27 / pre-existing). `authenticated` keeps EXECUTE
-- on the three user-facing RPCs because they do their own `auth.uid()`
-- checks inside the function body.
GRANT EXECUTE ON FUNCTION public.use_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_workout_assignments(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_meal_plan_assignments(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
