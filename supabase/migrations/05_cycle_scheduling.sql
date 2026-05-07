-- N-day rotation scheduling for workouts that don't fit a 7-day week
-- (8-day splits, 5-day splits, etc.).
--
--   workouts.cycle_length    INT, 1..60
--   workouts.cycle_position  INT, 1..cycle_length
--   workout_assignments.cycle_anchor_date  DATE — the calendar date that
--     maps to position 1 of the rotation for that client.
--
-- Either both cycle fields are non-null or both are null. When set, the
-- workout uses cycle scheduling and `days_of_week` is ignored.

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS cycle_length INTEGER
  CHECK (cycle_length IS NULL OR (cycle_length >= 1 AND cycle_length <= 60));

ALTER TABLE workouts ADD COLUMN IF NOT EXISTS cycle_position INTEGER
  CHECK (cycle_position IS NULL OR cycle_position >= 1);

ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_cycle_paired;
ALTER TABLE workouts ADD CONSTRAINT workouts_cycle_paired CHECK (
  (cycle_length IS NULL AND cycle_position IS NULL)
  OR (cycle_length IS NOT NULL AND cycle_position IS NOT NULL AND cycle_position <= cycle_length)
);

ALTER TABLE workout_assignments ADD COLUMN IF NOT EXISTS cycle_anchor_date DATE;
