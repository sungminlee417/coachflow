-- profiles.water_daily_goal_ml was INTEGER, which truncates fractional ml
-- values when goals are set in oz (e.g. 129 oz → 3814.9815 ml fails).
-- Widen to NUMERIC(12,4) to match water_logs.amount_ml.

ALTER TABLE public.profiles
  ALTER COLUMN water_daily_goal_ml TYPE numeric(12,4)
  USING water_daily_goal_ml::numeric(12,4);

NOTIFY pgrst, 'reload schema';
