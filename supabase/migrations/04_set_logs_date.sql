-- Adds the date dimension to set_logs so a workout repeated next week creates
-- new rows instead of overwriting last week's. Required for progressive
-- overload comparisons.
--
-- Existing rows have no timestamp to derive a date from, so they all bucket
-- into CURRENT_DATE. New logs going forward use the trainee's selectedDate.

ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE set_logs ADD COLUMN IF NOT EXISTS logged_date DATE;

UPDATE set_logs SET logged_date = CURRENT_DATE WHERE logged_date IS NULL;

ALTER TABLE set_logs ALTER COLUMN logged_date SET NOT NULL;
ALTER TABLE set_logs ALTER COLUMN logged_date SET DEFAULT CURRENT_DATE;

-- Replace the (assignment, exercise, set) UNIQUE with a four-column key that
-- includes the date. The constraint name varies by deployment, so we look up
-- whatever is there and drop it before adding the new one.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'set_logs'::regclass AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%(assignment_id, exercise_id, set_number)%'
    AND pg_get_constraintdef(oid) NOT LIKE '%logged_date%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE set_logs DROP CONSTRAINT %I', c);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'set_logs_assignment_exercise_set_date_key'
      AND conrelid = 'set_logs'::regclass
  ) THEN
    ALTER TABLE set_logs
      ADD CONSTRAINT set_logs_assignment_exercise_set_date_key
      UNIQUE (assignment_id, exercise_id, set_number, logged_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_set_logs_progress
  ON set_logs (exercise_id, logged_date DESC);
