-- Replace per-slot day-offset scheduling (start_day / end_day) with
-- days-of-week arrays that mirror the existing workout-level schedule
-- field. Three new columns:
--   workout_program_workouts.days_of_week  — slot-level override (null = inherit)
--   workout_programs.default_days_of_week  — program-level fallback
--   workout_assignments.days_of_week       — written at assign time; null means
--                                            "use the workout's own days_of_week"

ALTER TABLE public.workout_program_workouts
  DROP COLUMN IF EXISTS start_day,
  DROP COLUMN IF EXISTS end_day;

ALTER TABLE public.workout_program_workouts
  ADD COLUMN IF NOT EXISTS days_of_week smallint[] DEFAULT NULL;

ALTER TABLE public.workout_programs
  ADD COLUMN IF NOT EXISTS default_days_of_week smallint[] DEFAULT NULL;

ALTER TABLE public.workout_assignments
  ADD COLUMN IF NOT EXISTS days_of_week smallint[] DEFAULT NULL;

-- Recreate get_active_workout_assignments to include wa.days_of_week so the
-- client can prefer the assignment-level override over the workout template.
CREATE OR REPLACE FUNCTION public.get_active_workout_assignments(
  p_client_id uuid,
  p_date      date
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
  IF v_caller IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_caller <> p_client_id AND NOT EXISTS (
    SELECT 1
    FROM coach_client_relationships
    WHERE coach_id  = v_caller
      AND client_id = p_client_id
      AND status    = 'active'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',               wa.id,
        'start_date',       wa.start_date,
        'end_date',         wa.end_date,
        'completed',        wa.completed,
        'completed_at',     wa.completed_at,
        'notes',            wa.notes,
        'coach_id',         wa.coach_id,
        'cycle_anchor_date',wa.cycle_anchor_date,
        'days_of_week',     wa.days_of_week,
        'workout', jsonb_build_object(
          'id',          w.id,
          'name',        w.name,
          'description', w.description,
          'days_of_week',w.days_of_week,
          'cycle_length',w.cycle_length,
          'cycle_position', w.cycle_position,
          'exercises', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id',             e.id,
                'name',           e.name,
                'exercise_type',  e.exercise_type,
                'sets',           e.sets,
                'reps',           e.reps,
                'weight',         e.weight,
                'rest_seconds',   e.rest_seconds,
                'notes',          e.notes,
                'order_index',    e.order_index,
                'pair_with_next', e.pair_with_next,
                'cardio_subtype', e.cardio_subtype,
                'exercise_sets', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id',                       es.id,
                      'set_number',               es.set_number,
                      'target_reps',              es.target_reps,
                      'target_duration_seconds',  es.target_duration_seconds,
                      'notes',                    es.notes,
                      'target_speed',             es.target_speed,
                      'target_incline',           es.target_incline,
                      'target_resistance',        es.target_resistance
                    )
                    ORDER BY es.set_number
                  )
                  FROM exercise_sets es
                  WHERE es.exercise_id = e.id
                ), '[]'::jsonb),
                'exercise_alternatives', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id',          ea.id,
                      'name',        ea.name,
                      'order_index', ea.order_index
                    )
                    ORDER BY ea.order_index
                  )
                  FROM exercise_alternatives ea
                  WHERE ea.exercise_id = e.id
                ), '[]'::jsonb)
              )
              ORDER BY e.order_index
            )
            FROM exercises e
            WHERE e.workout_id = w.id
          ), '[]'::jsonb)
        )
      )
    )
    FROM workout_assignments wa
    JOIN workouts w ON w.id = wa.workout_id
    WHERE wa.client_id = p_client_id
      AND (wa.start_date IS NULL OR wa.start_date <= p_date)
      AND (wa.end_date   IS NULL OR wa.end_date   >= p_date)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_workout_assignments(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_active_workout_assignments(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
