-- Alternatives need their own portion + macros, not just a name. 218 cal of
-- potato is a different weight than 218 cal of rice — the coach should be
-- able to spell out exactly how much of the substitute the trainee should eat
-- and what its nutrition looks like.
--
-- These columns are nullable so name-only rows from the original migration
-- keep working — the trainee view just shows the name when nothing else is set.

ALTER TABLE food_alternatives ADD COLUMN IF NOT EXISTS quantity TEXT;
ALTER TABLE food_alternatives ADD COLUMN IF NOT EXISTS calories NUMERIC;
ALTER TABLE food_alternatives ADD COLUMN IF NOT EXISTS protein_grams NUMERIC;
ALTER TABLE food_alternatives ADD COLUMN IF NOT EXISTS carbs_grams NUMERIC;
ALTER TABLE food_alternatives ADD COLUMN IF NOT EXISTS fat_grams NUMERIC;
