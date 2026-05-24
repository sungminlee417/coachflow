-- `weight_program_start_date` anchors the "Week N" labels on the weight
-- tracker. When a trainee starts a cut / bulk / recomp on a specific
-- date, the chart marks weekly boundaries from that date and the share
-- dialog tags each entry with its week number.
--
-- NULL = no program in progress (the historical behavior). Most users
-- will leave this unset; the column exists so the few who do track a
-- formal program get a coherent timeline.
--
-- DATA SAFETY: pure additive column with a nullable default. No row is
-- modified by this migration. `ADD COLUMN IF NOT EXISTS` keeps re-runs
-- idempotent across deployments.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS weight_program_start_date DATE;

NOTIFY pgrst, 'reload schema';
