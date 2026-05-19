-- Per-user theme preference. Three valid values, persisted on the
-- profile so the choice follows the user across devices:
--   • 'system' — follow the OS preference via `prefers-color-scheme`.
--   • 'light'  — force light theme regardless of OS preference.
--   • 'dark'   — force dark theme regardless of OS preference.
--
-- Default is 'system' so new users get the OS-respecting behavior
-- without an explicit choice. Existing rows backfill to the default
-- via the column default (no UPDATE needed).
--
-- DATA SAFETY: pure additive column. No row modified. Re-running is a
-- no-op because of ADD COLUMN IF NOT EXISTS + the CHECK constraint
-- guard.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system';

-- Constrain to the three known values so the client can trust the
-- column shape. Wrapped in a DO block because constraint names can't
-- be made `IF NOT EXISTS` directly in DDL.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_theme_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_theme_check
      CHECK (theme IN ('system', 'light', 'dark'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
