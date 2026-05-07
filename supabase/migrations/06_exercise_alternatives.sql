-- Coach-defined alternatives per exercise. Surfaced on the trainee side as
-- chips below the exercise name; tapping a chip records a per-day
-- substitution (see 07_exercise_substitutions.sql).
--
-- Names are free-text — alternatives aren't linked to other exercise rows.

CREATE TABLE IF NOT EXISTS exercise_alternatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_alternatives_exercise
  ON exercise_alternatives (exercise_id, order_index);

ALTER TABLE exercise_alternatives ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercise_alternatives'
      AND policyname='read alternatives for visible workouts'
  ) THEN
    CREATE POLICY "read alternatives for visible workouts"
      ON exercise_alternatives FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM exercises e
          JOIN workouts w ON w.id = e.workout_id
          WHERE e.id = exercise_alternatives.exercise_id
            AND (
              w.coach_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM workout_assignments a
                WHERE a.workout_id = w.id AND a.client_id = auth.uid()
              )
            )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='exercise_alternatives'
      AND policyname='coaches manage their alternatives'
  ) THEN
    CREATE POLICY "coaches manage their alternatives"
      ON exercise_alternatives FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM exercises e
          JOIN workouts w ON w.id = e.workout_id
          WHERE e.id = exercise_alternatives.exercise_id
            AND w.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM exercises e
          JOIN workouts w ON w.id = e.workout_id
          WHERE e.id = exercise_alternatives.exercise_id
            AND w.coach_id = auth.uid()
        )
      );
  END IF;
END $$;
