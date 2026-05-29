-- Adds a `body_fat_percent` column to `weight_logs` so trainees can
-- tag a BF% reading onto each weigh-in. BF% lives alongside weight
-- rather than on `body_measurements` because the cadence matches —
-- weight + BF% are quick recurring data points, while circumference
-- measurements are a less-frequent comprehensive snapshot.
--
-- Stored as NUMERIC(5,2) which covers 0.00–999.99. Real-world BF%
-- sits in the 3–60 band; the range is generous to leave room for
-- future unit experiments without another migration. The UI clamps
-- to 0–100 at the input layer.
--
-- DATA SAFETY
--   • Additive column, NULL default — existing weight entries stay
--     valid and simply have no BF% reading.
--   • No constraint other than column type; UI bounds-checks.
--   • PostgREST schema reload at the end so the new column is
--     visible to the API without a manual restart.

ALTER TABLE weight_logs
  ADD COLUMN IF NOT EXISTS body_fat_percent NUMERIC(5, 2);

NOTIFY pgrst, 'reload schema';
