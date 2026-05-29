-- Adds a `body_fat_percent` column to `body_measurements` so trainees
-- can track BF% alongside circumference measurements. Stored as
-- NUMERIC(5,2) which comfortably covers 0.00–999.99 (real-world BF%
-- sits in the 3–60 band; the range is generous to leave room for
-- future unit experiments without another migration).
--
-- DATA SAFETY
--   • Additive column, NULL default — existing rows are untouched and
--     remain valid.
--   • No constraint other than the column type; UI does its own bounds
--     check (0 ≤ pct ≤ 100) so a fat-finger 1000 doesn't slip in.
--   • PostgREST schema reload at the end so the new column is visible
--     to the API without a manual restart.

ALTER TABLE body_measurements
  ADD COLUMN IF NOT EXISTS body_fat_percent NUMERIC(5, 2);

NOTIFY pgrst, 'reload schema';
