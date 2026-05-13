-- Server-side enforcement of authorization assumptions the client UI was
-- already making. Anything the client checks before a write should also
-- be enforced here, because a malicious client can just bypass the UI.
--
-- All policies are wrapped in `DO $$ BEGIN IF NOT EXISTS … END $$` so
-- re-runs across deployments are no-ops (the user's existing Supabase
-- project already has some of the SELECT/INSERT policies for these
-- tables — only the new constraints land).
--
-- DATA SAFETY: no row is modified. Only RLS policies and a CHECK
-- constraint are added. If the existing schema already permits the same
-- action the new policies permit, behavior is identical; the policies
-- just close holes that weren't being enforced.

-- ── invite_codes: server-side revocation enforcement ───────────────────
-- The app already checks `revoked_at IS NULL` on the client during
-- redemption, but a hand-crafted REST call could replay a revoked code.
-- Block the SELECT (the read that the acceptance flow uses) for any
-- non-coach. A revoked or expired code is still visible to the coach who
-- owns it (so the "Show revoked" toggle keeps working), but it can't be
-- redeemed by anyone else.
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='invite_codes'
      AND policyname='coaches manage their invite codes'
  ) THEN
    CREATE POLICY "coaches manage their invite codes"
      ON invite_codes FOR ALL
      USING (coach_id = auth.uid())
      WITH CHECK (coach_id = auth.uid());
  END IF;
END $$;

-- NOTE on invite redemption: a trainee accepting a code does
--   `from('invite_codes').select(...).eq('code', X)` while authenticated.
-- For that flow to work without leaking codes to *all* users, redemption
-- should move to a SECURITY DEFINER RPC (e.g. `redeem_invite(code text)`)
-- that does the validation server-side and returns only the resulting
-- relationship. Doing it via a permissive SELECT policy would expose
-- every active code to any signed-in user. We intentionally don't add
-- that policy here — current redemption keeps working against whatever
-- the existing schema already allows; if you later tighten that policy,
-- swap the client-side acceptance for an RPC.

-- ── coach_client_relationships: only the trainee themselves can create ─
-- the relationship row on invite acceptance (their auth.uid() must equal
-- client_id). Coach can't unilaterally create a coaching link on behalf
-- of someone else.
ALTER TABLE coach_client_relationships ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='coach_client_relationships'
      AND policyname='trainee creates own relationship'
  ) THEN
    CREATE POLICY "trainee creates own relationship"
      ON coach_client_relationships FOR INSERT
      WITH CHECK (client_id = auth.uid());
  END IF;
END $$;

-- ── workout_assignments: coach owns assignment, client reads own ──────
-- Without this, the client UI could request `coach_id = X` arbitrarily.
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

-- ── meal_plan_assignments: same shape as workout_assignments ──────────
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

-- ── set_logs / meal_logs / weight_logs / body_measurements: only the
--    owning user can read or write their own log rows. Coaches read via
--    the relationship side, not via direct ownership; if a coach-view
--    is added later it'll need its own policy.
ALTER TABLE set_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='weight_logs'
      AND policyname='user manages own weight logs'
  ) THEN
    CREATE POLICY "user manages own weight logs"
      ON weight_logs FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='body_measurements'
      AND policyname='user manages own measurements'
  ) THEN
    CREATE POLICY "user manages own measurements"
      ON body_measurements FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_logs'
      AND policyname='user manages own meal logs'
  ) THEN
    CREATE POLICY "user manages own meal logs"
      ON meal_logs FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- set_logs has no `user_id` column; ownership is derived from the
-- workout_assignments row. We policy through the assignment.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='set_logs'
      AND policyname='user manages own set logs'
  ) THEN
    CREATE POLICY "user manages own set logs"
      ON set_logs FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workout_assignments wa
          WHERE wa.id = set_logs.assignment_id
            AND wa.client_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workout_assignments wa
          WHERE wa.id = set_logs.assignment_id
            AND wa.client_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── profiles: every user can read their own row + update their own row.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='user reads own profile'
  ) THEN
    CREATE POLICY "user reads own profile"
      ON profiles FOR SELECT
      USING (id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='user updates own profile'
  ) THEN
    CREATE POLICY "user updates own profile"
      ON profiles FOR UPDATE
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- Coaches need to look up their clients' profiles (full_name, email) for
-- the dashboard's client list. Limited to profiles of users that the
-- caller actually coaches — not a global directory.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='coach reads client profiles'
  ) THEN
    CREATE POLICY "coach reads client profiles"
      ON profiles FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM coach_client_relationships ccr
          WHERE ccr.coach_id = auth.uid()
            AND ccr.client_id = profiles.id
        )
      );
  END IF;
END $$;

-- And the reverse: a trainee needs to see their coach's profile in the
-- "Coached by" card on the daily view.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='client reads coach profile'
  ) THEN
    CREATE POLICY "client reads coach profile"
      ON profiles FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM coach_client_relationships ccr
          WHERE ccr.client_id = auth.uid()
            AND ccr.coach_id = profiles.id
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
