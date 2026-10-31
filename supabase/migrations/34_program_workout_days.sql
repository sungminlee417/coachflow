-- Per-workout day-range offsets within a program.
-- start_day / end_day are 1-indexed (day 1 = program start date).
-- NULL means "use the program-level start / end date" (existing behaviour).
ALTER TABLE workout_program_workouts
  ADD COLUMN IF NOT EXISTS start_day INTEGER,
  ADD COLUMN IF NOT EXISTS end_day   INTEGER;

-- Store the program-level dates on the tracking row so that the auto-fan-out
-- path (when a new workout is added to an existing program) can compute
-- absolute dates for workouts that have day offsets.
ALTER TABLE program_assignments
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date   DATE;

NOTIFY pgrst, 'reload schema';
