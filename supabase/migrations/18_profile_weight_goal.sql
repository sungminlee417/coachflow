-- Optional body-weight goal on the user's profile. Surfaces as a
-- dashed reference line on the weight chart and a small "X away" stamp
-- on the Today dashboard, so the trainee sees their target every time
-- they log a weight.
--
-- DATA SAFETY: purely additive. Existing profiles get NULL, which the
-- UI treats as "no goal set". No row is touched.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS weight_goal NUMERIC;

NOTIFY pgrst, 'reload schema';
