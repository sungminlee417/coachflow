-- Adds a SECURITY DEFINER RPC the coach UI uses to render a "last seen"
-- indicator next to every client on the Clients screen. Returns the most
-- recent activity timestamp per client across the four logging tables
-- (set_logs, meal_logs, weight_logs, body_measurements), so a quiet week
-- on all fronts surfaces as "at risk" rather than a single channel.
--
-- AUTHORIZATION
--   The function is called with the coach's own id as `p_coach_id`. We
--   require `auth.uid() = p_coach_id` so a coach cannot peek at another
--   coach's client roster. Inside the body, we only aggregate rows where
--   an active `coach_client_relationships` row exists for that coach.
--
-- DATA SAFETY
--   • No DML — pure aggregating SELECTs.
--   • `STABLE` so the planner can cache within a statement.
--   • search_path locked to public + pg_temp, matching the rest of
--     the codebase's SECURITY DEFINER functions.

CREATE OR REPLACE FUNCTION public.get_client_last_active_dates(
  p_coach_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR v_caller <> p_coach_id THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'client_id', client_id,
        'last_active_date', last_active_date
      )
    )
    FROM (
      SELECT
        ccr.client_id,
        GREATEST(
          -- set_logs has no client_id of its own — ownership lives on
          -- the parent workout_assignments row, so we join through.
          (
            SELECT MAX(sl.logged_date)
            FROM set_logs sl
            JOIN workout_assignments wa ON wa.id = sl.assignment_id
            WHERE wa.client_id = ccr.client_id
          ),
          (SELECT MAX(ml.logged_date) FROM meal_logs ml WHERE ml.user_id = ccr.client_id),
          (SELECT MAX(wl.recorded_at) FROM weight_logs wl WHERE wl.user_id = ccr.client_id),
          (SELECT MAX(bm.recorded_at) FROM body_measurements bm WHERE bm.user_id = ccr.client_id)
        ) AS last_active_date
      FROM coach_client_relationships ccr
      WHERE ccr.coach_id = p_coach_id
        AND ccr.status = 'active'
        AND ccr.client_id <> ccr.coach_id
    ) t
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_last_active_dates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_last_active_dates(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
