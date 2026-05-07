-- Per-user unit preferences. Drives lb/kg + in/cm rendering across the app.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS length_unit TEXT NOT NULL DEFAULT 'in'
  CHECK (length_unit IN ('in', 'cm'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS weight_unit TEXT NOT NULL DEFAULT 'lbs'
  CHECK (weight_unit IN ('lbs', 'kg'));
