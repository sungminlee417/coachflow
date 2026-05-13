-- Indexes for the hot read paths the app hits every time a trainee opens
-- a daily view. All `IF NOT EXISTS` so re-runs are no-ops.
--
-- DATA SAFETY: indexes are pure additions. No row is touched. They cost a
-- little extra write time and storage; the read wins more than pay for it.

-- ── set_logs ────────────────────────────────────────────────────────────
-- Drives `fetchPriorPerformance` ("Last: 135 × 8" hints + PR detection)
-- and the daily "today's values" fetch. Sort key matches the query: filter
-- by exercise_id + assignment_id, order by logged_date DESC.
CREATE INDEX IF NOT EXISTS idx_set_logs_prior_lookup
  ON set_logs (exercise_id, assignment_id, logged_date DESC);

-- Cheap covering index for the WorkoutHistory "all-time PR" aggregation
-- which scans every set_log for the client. Keyed by (exercise_id) so the
-- partition-by-exercise grouping is index-friendly.
CREATE INDEX IF NOT EXISTS idx_set_logs_exercise_history
  ON set_logs (exercise_id, logged_date DESC)
  WHERE completed = true;

-- ── meal_logs ───────────────────────────────────────────────────────────
-- Drives both the per-day "what did I eat" load in ClientMealPlanView and
-- the missed-meal banner.
CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date
  ON meal_logs (user_id, logged_date);

-- ── workout_assignments ─────────────────────────────────────────────────
-- The daily view filters by `client_id` and a date range over (start_date,
-- end_date). A composite index on (client_id, start_date) speeds up the
-- "active on this date" lookup substantially when a client has many past
-- and future assignments.
CREATE INDEX IF NOT EXISTS idx_workout_assignments_client_date
  ON workout_assignments (client_id, start_date);

-- ── meal_plan_assignments ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meal_plan_assignments_client_date
  ON meal_plan_assignments (client_id, start_date);

-- ── body_measurements ───────────────────────────────────────────────────
-- The measurements view sorts entries by recorded_at DESC for the timeline.
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date
  ON body_measurements (user_id, recorded_at DESC);

-- ── weight_logs ─────────────────────────────────────────────────────────
-- Same shape: weight tracker reads recent entries ordered by recorded_at.
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date
  ON weight_logs (user_id, recorded_at DESC);

-- ── exercise_substitutions ─────────────────────────────────────────────
-- fetchPriorPerformance fans out one substitutions lookup per exercise per
-- day. Keyed by (assignment_id, exercise_id, logged_date) so the query
-- planner can pick the right pages without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_exercise_substitutions_lookup
  ON exercise_substitutions (assignment_id, exercise_id, logged_date);

NOTIFY pgrst, 'reload schema';
