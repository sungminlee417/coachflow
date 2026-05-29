-- Cleans up after the original migration 31, which mistakenly added
-- `body_fat_percent` to `body_measurements`. BF% belongs on
-- `weight_logs` — it shares the cadence of a weigh-in (quick, recurring)
-- rather than the cadence of circumferences (less-frequent, comprehensive
-- snapshot).
--
-- The rewritten migration 31 now targets `weight_logs` directly. This
-- migration handles the in-place fix for a database that already ran
-- the original 31:
--
--   1. (Belt-and-braces) ensure the new column exists on weight_logs in
--      case 31 hasn't been re-run.
--   2. Carry any BF% values that were entered against body_measurements
--      over to the matching same-day weight_log, when one exists. Only
--      copies when the weight_log doesn't already have a BF% reading
--      (avoid clobbering an explicit one).
--   3. Drop the now-stale column from body_measurements.
--
-- Idempotent — every statement is guarded so re-running on a clean DB
-- (where step 3's column never existed) is a safe no-op.
--
-- DATA SAFETY
--   • The UPDATE in step 2 only writes when both sides match on
--     (user_id, recorded_at) AND the destination is null. No row is
--     ever overwritten.
--   • BF% values logged on body_measurements WITHOUT a matching
--     same-day weight_log have nowhere to land — they are dropped with
--     the column. Practically there are none, since the BF%-on-
--     body_measurements UI lived for a single dev session. If you do
--     have such rows, run the SELECT below before applying this
--     migration to confirm what would be lost:
--
--       SELECT user_id, recorded_at, body_fat_percent
--       FROM body_measurements
--       WHERE body_fat_percent IS NOT NULL
--         AND NOT EXISTS (
--           SELECT 1 FROM weight_logs wl
--           WHERE wl.user_id = body_measurements.user_id
--             AND wl.recorded_at = body_measurements.recorded_at::date
--         );

-- 1. Make sure the weight_logs column is there.
ALTER TABLE weight_logs
  ADD COLUMN IF NOT EXISTS body_fat_percent NUMERIC(5, 2);

-- 2. Carry over any matching data. The cast to ::date handles the case
--    where body_measurements.recorded_at is timestamptz while
--    weight_logs.recorded_at is plain date (or vice-versa) — either way
--    we compare on the day, which is the resolution the UI uses.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'body_measurements'
      AND column_name = 'body_fat_percent'
  ) THEN
    UPDATE weight_logs wl
    SET body_fat_percent = bm.body_fat_percent
    FROM body_measurements bm
    WHERE bm.user_id = wl.user_id
      AND bm.recorded_at::date = wl.recorded_at::date
      AND bm.body_fat_percent IS NOT NULL
      AND wl.body_fat_percent IS NULL;
  END IF;
END $$;

-- 3. Drop the stale column.
ALTER TABLE body_measurements
  DROP COLUMN IF EXISTS body_fat_percent;

NOTIFY pgrst, 'reload schema';
