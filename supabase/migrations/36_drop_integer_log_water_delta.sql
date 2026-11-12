-- Migration 35 used CREATE OR REPLACE with a different parameter type
-- (integer → numeric), which created a second overload instead of
-- replacing the original. PostgREST cannot resolve the ambiguity.
-- Drop the old integer signature so only the numeric version remains.

DROP FUNCTION IF EXISTS public.log_water_delta(date, integer);

NOTIFY pgrst, 'reload schema';
