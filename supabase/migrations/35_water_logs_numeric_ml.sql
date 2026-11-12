-- Change water_logs.amount_ml from INTEGER to NUMERIC so fractional
-- millilitre values can be stored. This eliminates the oz↔ml round-trip
-- error that caused "20 oz added" to display as 19.98 oz: previously
-- 20 oz → round(591.47) = 591 ml → 19.984 oz; now 20 oz → 591.47 ml →
-- 20.00 oz exactly.
--
-- Existing integer rows stay correct — Postgres casts integers to NUMERIC
-- without data loss.

-- Drop and re-add the CHECK constraint because ALTER TYPE doesn't update
-- it automatically.
DO $$ BEGIN
  ALTER TABLE public.water_logs DROP CONSTRAINT IF EXISTS water_logs_amount_ml_check;
END $$;

ALTER TABLE public.water_logs
  ALTER COLUMN amount_ml TYPE numeric(12,4) USING amount_ml::numeric(12,4);

ALTER TABLE public.water_logs
  ADD CONSTRAINT water_logs_amount_ml_check CHECK (amount_ml >= 0);

-- Recreate the RPC accepting numeric so fractional deltas (e.g. 591.47 ml
-- for exactly 20 oz) are stored without being truncated to an integer.
-- The old integer signature is replaced with a CREATE OR REPLACE so
-- existing callers compiled against the old signature still work if the
-- value is a whole number; Postgres will coerce integer → numeric.
CREATE OR REPLACE FUNCTION public.log_water_delta(
  p_date    date,
  p_delta_ml numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid    := auth.uid();
  v_new_amount numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'log_water_delta requires an authenticated user';
  END IF;

  INSERT INTO public.water_logs (user_id, logged_date, amount_ml)
  VALUES (v_user_id, p_date, GREATEST(0, p_delta_ml))
  ON CONFLICT (user_id, logged_date)
  DO UPDATE SET amount_ml = GREATEST(0, public.water_logs.amount_ml + p_delta_ml)
  RETURNING amount_ml INTO v_new_amount;

  RETURN v_new_amount;
END;
$$;

-- Re-grant to authenticated (CREATE OR REPLACE doesn't carry grants).
GRANT EXECUTE ON FUNCTION public.log_water_delta(date, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
