-- Coach-side bundles of workouts (Push/Pull/Legs, beginner program, etc.).
-- Assigning a program creates one workout_assignments row per member workout
-- via the existing assignment flow; programs themselves don't have
-- assignment rows, so removing/deleting a program never affects already-made
-- assignments or their set_logs.

CREATE TABLE IF NOT EXISTS workout_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ordered membership: a workout can live in multiple programs; a program
-- shows the same workout at most once. CASCADE on both sides cleans up join
-- rows when either parent is removed — but never touches the workouts /
-- programs themselves or their assignments.
CREATE TABLE IF NOT EXISTS workout_program_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES workout_programs(id) ON DELETE CASCADE,
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, workout_id)
);

CREATE INDEX IF NOT EXISTS idx_program_workouts_lookup
  ON workout_program_workouts (program_id, order_index);

ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_program_workouts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workout_programs'
      AND policyname='coaches manage their own programs'
  ) THEN
    CREATE POLICY "coaches manage their own programs"
      ON workout_programs FOR ALL
      USING (coach_id = auth.uid())
      WITH CHECK (coach_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workout_program_workouts'
      AND policyname='coaches manage workouts in their programs'
  ) THEN
    CREATE POLICY "coaches manage workouts in their programs"
      ON workout_program_workouts FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM workout_programs p
          WHERE p.id = workout_program_workouts.program_id
            AND p.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM workout_programs p
          WHERE p.id = workout_program_workouts.program_id
            AND p.coach_id = auth.uid()
        )
      );
  END IF;
END $$;
