-- Cardio subtype + machine-specific prescription / logging fields.
--
-- Different cardio machines have different relevant variables: a treadmill
-- prescription needs speed + incline; a cycle needs resistance level; a
-- stairmaster sits in between. Rather than overloading `target_reps` or
-- carrying free-form notes, we add typed columns that are queryable later
-- (e.g. "show my treadmill incline trend over 90 days").
--
-- Naming convention: `target_*` lives on `exercise_sets` (per-interval
-- prescription, text so it can carry ranges like "3-4"); `*_performed`
-- lives on `set_logs` (numeric because actual values are aggregated).
--
-- DATA SAFETY: purely additive. Every existing cardio row gets NULL for
-- the new columns. NULL cardio_subtype is treated as "generic cardio" by
-- the UI, which is exactly how today's cardio behaves.

-- Machine type. We don't enforce a CHECK constraint because the UI's
-- own enum stays the source of truth — easier to add "assault_bike"
-- later without a schema migration.
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS cardio_subtype TEXT;

-- Per-interval prescription. Text so coaches can write ranges like
-- "3-4" (mph) or "10-15" (% incline). Same shape as `target_reps`.
ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS target_speed TEXT;

ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS target_incline TEXT;

ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS target_resistance TEXT;

-- Trainee-logged actuals. Numeric so we can chart and detect PRs.
ALTER TABLE set_logs
  ADD COLUMN IF NOT EXISTS speed_performed NUMERIC;

ALTER TABLE set_logs
  ADD COLUMN IF NOT EXISTS incline_performed NUMERIC;

ALTER TABLE set_logs
  ADD COLUMN IF NOT EXISTS resistance_performed NUMERIC;

NOTIFY pgrst, 'reload schema';
