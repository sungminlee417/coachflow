-- Water intake tracking. One row per (user, day) with amount in canonical
-- millilitres — display units follow the trainee's existing `weight_unit`
-- (lbs → oz, kg → ml) so there's no new preference to manage.
--
-- Storage in ml (integer) avoids floating-point drift on incremental adds
-- and lets us add fractional-cup entries later without a migration.
--
-- Daily goal lives on the profile so the trainee sets it once, not per-day.
-- NULL = "no goal yet"; the UI defaults to 2000 ml for display until the
-- user sets a value.

CREATE TABLE IF NOT EXISTS public.water_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_ml integer NOT NULL DEFAULT 0 CHECK (amount_ml >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PK guard follows the same pg_constraint pattern used elsewhere so a
-- re-run against a partially-initialized DB doesn't hit 42P16.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.water_logs'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.water_logs
      ADD CONSTRAINT water_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- One row per user per day — the quick-add path upserts on this key so
-- incremental additions accumulate into the existing row.
DO $$ BEGIN
  ALTER TABLE public.water_logs
    ADD CONSTRAINT water_logs_user_date_key UNIQUE (user_id, logged_date);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Recent-first per-user reads (Today card + future history view).
CREATE INDEX IF NOT EXISTS water_logs_user_date_idx
  ON public.water_logs (user_id, logged_date DESC);

-- Auto-touch updated_at on every mutation.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER water_logs_set_updated_at
    BEFORE UPDATE ON public.water_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- RLS: trainees own their rows; coaches can read (only) their active
-- clients' rows so accountability views can show hydration alongside
-- weight and workouts.
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users manage own water logs" ON public.water_logs
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "coaches view client water logs" ON public.water_logs
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM public.coach_client_relationships ccr
      WHERE ccr.client_id = water_logs.user_id
        AND ccr.coach_id = auth.uid()
        AND ccr.status = 'active'
    ));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- Per-user daily hydration goal (ml). NULL = user hasn't set one; UI
-- defaults to 2000 ml (~68 oz) for display, matching mainstream guidance.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS water_daily_goal_ml integer;

-- Atomic increment RPC so rapid quick-add taps (or a shaky network)
-- can't cause read-modify-write to lose an increment. Server does the
-- addition inside a single SQL statement and returns the new total.
-- Undo is supported by passing a negative delta; result is clamped to 0
-- so an over-eager undo can't put the day into negative territory.
CREATE OR REPLACE FUNCTION public.log_water_delta(
  p_date date,
  p_delta_ml integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_amount integer;
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

GRANT EXECUTE ON FUNCTION public.log_water_delta(date, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
