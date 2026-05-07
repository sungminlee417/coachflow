# Migrations

These migrations are **additive and idempotent** — they layer on top of an
existing CoachFlow Supabase project. Each file uses `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, and policy/constraint guards so re-running is
safe.

If you're standing up a fresh database, run the files in order, then:

```sql
NOTIFY pgrst, 'reload schema';
```

The original base schema (`profiles`, `workouts`, `exercises`,
`workout_assignments`, `meal_plans`, `meals`, `coach_client_relationships`,
`invite_codes`, `weight_logs`, `body_measurements`, etc.) lives outside this
directory — it predates the migration tracking shown here.
