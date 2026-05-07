-- Per-day record of which alternative the trainee used (if any) for a given
-- assignment+exercise. Drives variant-aware progressive overload comparisons:
-- next week's "Last: 135 × 8" hint pulls from the most recent prior date
-- whose substitution variant matches today's.

CREATE TABLE IF NOT EXISTS exercise_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES workout_assignments(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL,
  substituted_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, exercise_id, logged_date)
);

CREATE INDEX IF NOT EXISTS idx_exercise_substitutions_lookup
  ON exercise_substitutions (assignment_id, exercise_id, logged_date DESC);

ALTER TABLE exercise_substitutions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercise_substitutions'
      AND policyname='clients manage their substitutions'
  ) THEN
    CREATE POLICY "clients manage their substitutions"
      ON exercise_substitutions FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workout_assignments a
          WHERE a.id = exercise_substitutions.assignment_id
            AND a.client_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workout_assignments a
          WHERE a.id = exercise_substitutions.assignment_id
            AND a.client_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercise_substitutions'
      AND policyname='coaches view their clients'' substitutions'
  ) THEN
    CREATE POLICY "coaches view their clients' substitutions"
      ON exercise_substitutions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM workout_assignments a
          WHERE a.id = exercise_substitutions.assignment_id
            AND a.coach_id = auth.uid()
        )
      );
  END IF;
END $$;
