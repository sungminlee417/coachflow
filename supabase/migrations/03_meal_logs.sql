-- Daily meal-eaten checkmarks. Mirrors set_logs but with a date dimension
-- since meal plans recur — each calendar day gets its own log row.

CREATE TABLE IF NOT EXISTS meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES meal_plan_assignments(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meal_id, user_id, logged_date)
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date ON meal_logs (user_id, logged_date);

ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_logs'
      AND policyname='users manage their own meal logs'
  ) THEN
    CREATE POLICY "users manage their own meal logs"
      ON meal_logs FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='meal_logs'
      AND policyname='coaches view their clients'' meal logs'
  ) THEN
    CREATE POLICY "coaches view their clients' meal logs"
      ON meal_logs FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM coach_client_relationships ccr
          WHERE ccr.client_id = meal_logs.user_id
            AND ccr.coach_id = auth.uid()
            AND ccr.status = 'active'
        )
      );
  END IF;
END $$;
