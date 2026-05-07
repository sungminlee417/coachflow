-- Cardio support alongside strength. exercises gain a `type`; per-set rows
-- and set logs gain a duration column for cardio prescriptions/performance.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS exercise_type TEXT NOT NULL DEFAULT 'strength'
  CHECK (exercise_type IN ('strength','cardio'));

ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS target_duration_seconds INTEGER;

ALTER TABLE set_logs
  ADD COLUMN IF NOT EXISTS duration_performed_seconds INTEGER;
