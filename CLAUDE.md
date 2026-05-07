# Working notes for Claude

Project-specific rules to follow on every change. Read these before starting work.

## Always update the README

Whenever you ship a new user-facing feature, change the data model, or alter
how the app is set up / deployed, update [`README.md`](README.md) in the same
change. Specifically:

- New feature → add a bullet under **Highlights** (the right side: coach,
  trainee, or cross-cutting).
- New table or column → update the schema table under **Database** and add a
  numbered migration in [`supabase/migrations/`](supabase/migrations/).
- New env var, new dependency, new build step → update **Getting started**.
- Renamed/moved file or directory → update **Project layout** if it's a
  significant move.

If a change is purely a refactor with no user-visible or schema impact, you
can skip the README — but mention the new file paths in the PR description.

## Always update / write a migration

Every schema change goes in [`supabase/migrations/`](supabase/migrations/) as
a numbered, additive, idempotent SQL file. The conventions:

- Use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`.
- For policies, wrap in `DO $$ BEGIN IF NOT EXISTS (...) THEN CREATE POLICY ...
  END IF; END $$` so re-running is safe.
- For constraints with names that may collide across deployments, look up the
  existing one via `pg_constraint` and `EXECUTE format('... DROP CONSTRAINT
  %I', name)` before adding the new one.
- File naming: `NN_description.sql` where `NN` is the next sequential number.
- End the file with a `NOTIFY pgrst, 'reload schema'` if the change adds
  columns or tables PostgREST needs to see.

The user's existing Supabase project may already have most of these applied.
That's fine — the idempotency means re-running is a no-op.

## Data-safety guarantees

- **Never** schedule a destructive cascade as a side-effect of a "clean up"
  operation. If a builder save needs to remove rows, only remove what the user
  explicitly removed (see the diff strategy in
  [`WorkoutBuilder.handleSave`](components/coaching/WorkoutBuilder.tsx)).
- **Never** delete-and-reinsert a row that has client-owned children
  (`set_logs`, `exercise_substitutions`, `meal_logs`). Those reference rows by
  id; preserving the id preserves the child data.
- When in doubt, query first to verify what's affected, and prefer
  `UPDATE`-in-place over `DELETE + INSERT`.

## Style preferences

- **No `any` at boundaries.** Type the Supabase row shapes explicitly in
  [`lib/queries.ts`](lib/queries.ts) and elsewhere.
- **Local-time dates everywhere user-visible.** Don't use `new Date('YYYY-MM-DD')`
  — it parses as UTC. Use `parseLocalISO` / `weekdayOf` / `daysBetween` from
  [`lib/utils.ts`](lib/utils.ts).
- **Skeleton-first loading.** Fetch sites should render a skeleton shaped like
  the eventual content, never a centered "Loading..." string. Use
  [`Skeleton`/`CardGridSkeleton`/`ListSkeleton`](components/ui/Skeleton.tsx).
- **Optimistic UI** for fire-and-forget actions (toggles, swaps); rollback +
  toast on error.
- **Mobile-first.** Test sticky bars with `pb-[max(0.75rem,env(safe-area-inset-bottom))]`.
  Avoid `flex-shrink-0` (use `shrink-0`).
- **Sort timed lists chronologically, then untimed by manual order.** This is
  the convention used in [`fetchActiveMealPlanAssignments`](lib/queries.ts)
  and [`MealPlanBuilder`](components/coaching/MealPlanBuilder.tsx).

## When in doubt, ask

For any non-trivial design call (UX flow, data model addition, migration
strategy), respond with a short recommendation + the main tradeoff and ask
the user before implementing. Don't ship a 200-line refactor on a vague
"clean it up" request without confirming the scope.
