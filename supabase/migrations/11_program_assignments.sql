-- Tracks "Client X has Program Y" so that adding a workout to a program later
-- can fan out into new workout_assignments for everyone who has the program.
--
-- Why a separate table: workout_assignments don't reference the program they
-- came from. Without this record, adding a workout to a program reaches no
-- one — see the "new workout not appearing" bug this fixes.
--
-- DATA SAFETY: this is purely additive. No existing row in workout_assignments,
-- set_logs, exercise_substitutions, or anywhere else is touched by this
-- migration or the feature it unlocks. The auto-sync only ever INSERTs new
-- workout_assignments — it never updates or deletes existing ones.

CREATE TABLE IF NOT EXISTS program_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stored at assign-time so cycle workouts added to the program later use
  -- the same anchor as the rest of the program (the rotation stays in sync).
  cycle_anchor_date DATE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_program_assignments_lookup
  ON program_assignments (program_id, client_id);

ALTER TABLE program_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='program_assignments'
      AND policyname='coaches manage their program assignments'
  ) THEN
    CREATE POLICY "coaches manage their program assignments"
      ON program_assignments FOR ALL
      USING (coach_id = auth.uid())
      WITH CHECK (coach_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='program_assignments'
      AND policyname='clients see their program assignments'
  ) THEN
    CREATE POLICY "clients see their program assignments"
      ON program_assignments FOR SELECT
      USING (client_id = auth.uid());
  END IF;
END $$;
