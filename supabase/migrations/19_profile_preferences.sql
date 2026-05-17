-- 19_profile_preferences.sql
--
-- Per-user UI preference toggles. Each is a typed boolean column on
-- `profiles` so they're cheap to read alongside the existing profile
-- query and Supabase types pick them up automatically (no JSONB
-- destructuring needed at the call site).
--
-- New columns default to TRUE (the historical, always-on behavior) so
-- existing users don't have features silently disabled on first read.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS rest_timer_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS show_streak_card BOOLEAN NOT NULL DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';
