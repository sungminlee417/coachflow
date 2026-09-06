# CoachFlow

A coaching-and-training platform where every user can both coach and train. One account, two hats — assign yourself a workout, or grab an invite code and let someone else coach you. Built on Next.js 16 + Supabase, mobile-first, no role flag to manage.

## Highlights

### For coaches
- **Workout builder** with strength + cardio exercises, supersets (chains of `pair_with_next`), per-set prescriptions, alternatives that the trainee can swap to, and either weekly or N-day rotation scheduling. Exercise names autocomplete from a curated 873-exercise catalog (yuhonas/free-exercise-db, MIT) — picking an entry stamps `catalog_id` on the row so muscles / equipment / difficulty are dereferenceable later; typing freeform still works exactly like before.
- **Cardio machine subtypes** — treadmill / stairmaster / cycle / rower / elliptical / other. Each subtype enables the fields that actually matter for that machine: treadmill shows `target_speed` + `target_incline` (text, so coaches can write ranges like "3-4"); cycle/rower/elliptical show `target_resistance`; stairmaster shows both speed + resistance. Trainees log numeric `speed_performed` / `incline_performed` / `resistance_performed` on each set — typed columns so PR detection ("longest 15% incline session this quarter") works later. NULL subtype = generic cardio, behaves exactly like the legacy free-duration cardio.
- **Drag-and-drop** reordering for exercises, alternatives, and workouts inside programs (`@dnd-kit`, mouse + touch + keyboard).
- **Programs** group workouts together (Push/Pull/Legs, beginner plan, etc.). Assigning a program creates one `workout_assignments` row per member workout, plus a `program_assignments` tracking row. Adding a workout to a program later **auto-fans-out** to every client who already has the program — no need to re-click Assign. Removing a workout from the program never auto-unassigns from clients (deliberate). Cycle workouts added later reuse the anchor date stored at original assign time so the rotation stays in phase.
- **Meal-plan builder** with meals → foods → optional ingredients, auto-rolled-up macros, days-of-week scheduling, and optional time-of-day. Meals can be **duplicated** (deep copy of foods + ingredients) and reorder via drag-and-drop. Times auto-sort meals chronologically; untimed meals follow in manual order. Each food can also have **alternatives** with their own quantity + macros ("Greek yogurt — 200g · 200 cal · 20g P"), since 218 cal of rice and 218 cal of potato are very different weights.
- **Invite-based client onboarding** (`/invite?code=…`) with configurable max uses (1 / 5 / unlimited) and expiration (24h / 7d / 30d / never). Unused codes can be hard-deleted; used codes are soft-revoked (`revoked_at`) so the audit trail and `coach_client_relationships.invite_code_id` references stay intact. Revoked or expired codes are rejected at acceptance.
- **Diff-based saves** preserve `exercise_id` (workouts) and `meal_id` (meal plans) across edits. Renaming, reordering, swapping types, editing alternatives, duplicating a meal — none of those touch the trainee's `set_logs` or `meal_logs`. Only explicitly removing a row cascades.
- **Client activity badge** — every client card on the Clients screen renders a colour-coded "Active today / 2d ago / 7d quiet / 30d+ inactive" pill so a coach can spot a quiet trainee at a glance. Powered by the [`get_client_last_active_dates`](supabase/migrations/30_coach_client_last_active.sql) SECURITY DEFINER RPC, which aggregates the most recent activity across `set_logs`, `meal_logs`, `weight_logs`, and `body_measurements` in a single round trip. At-risk rows also pick up a rose card border so the eye finds them in a long list.
- **Bulk program assignment** — the ProgramAssignmentModal can now flip into a multi-select roster (every client + "Myself") with select-all / clear shortcuts, so rolling out a new program to 12 clients is one Assign click instead of twelve. Existing single-client flow is unchanged when launched from a client detail view.
- **Quick-add exercise catalog** in the WorkoutBuilder — surfaces the coach's 12 most-used exercises (from their other workouts) as one-tap chips above the Exercise list. Cardio chips carry the `cardio_subtype` through so the right machine fields appear immediately on the new row.

### For trainees
- **Daily workout view** with a week strip + arrow navigation (past and future weeks), per-set logging that auto-saves on blur, and an `aria-live` daily progress chip.
- **Rest timer** kicks off automatically when a set is checked off (uses the exercise's `rest_seconds`). Sticky-bottom countdown with a `+15s` button, audible chirp + haptic when it ends. For supersets the timer fires when the round completes (rest between rounds, not within).
- **Progress view** — per-exercise all-time best (heaviest weight × reps for strength, longest duration for cardio), total volume, lifetime sets, last-performed date. Sourced from every set you've ever logged.
- **Missed-meal reminder** — on today's view, a banner nudges the trainee about scheduled meals (with a `time`) that have passed by 30+ minutes without being checked off. Per-day dismissible.
- **Progressive overload hints**: `Last: 135 × 8` ghosts in *above* each strength set as a pre-set reminder, alongside an adaptive load-suggestion chip (`↓ Try 130` / `↑ Try 140`) when last session's reps fell outside the prescribed range. Suggested deltas tier with weight (±2.5 / ±5 / ±10). After the set is logged, an emerald `↑ Beat last` pill drops in below the inputs the moment you beat last week's performance. Variant-aware — barbell-squat days compare against barbell-squat history, goblet-squat days against goblet-squat history. AMRAP / freeform prescriptions skip the suggestion silently.
- **Substitution chips** under each exercise (`or: Goblet Squat · Leg Press · Hack Squat`). Tap to swap; one-tap revert. Per-day, per-assignment scope so a swap doesn't bleed across workouts.
- **Auto-collapse on completion** — finished sets and finished superset rounds collapse to a one-line summary (`Set 1 · ✓ · 135 × 8`); tap to re-expand if you misclicked, with an in-row "↑ Collapse" link to fold it back.
- **Cardio support** — duration in `mm:ss`, `1h 20m`, or bare-number minutes; intervals supported.
- **Meal logging** — per-day check on each meal with a daily "X / Y eaten" chip; coach can see their clients' check history via RLS.
- **Water intake tracking** — quick-add buttons on the Today dashboard (small / bottle / large glass, unit-aware for lbs vs kg users) accumulate throughout the day. A server-side atomic RPC (`log_water_delta`) does the addition so rapid taps or flaky retries can't lose an increment. Progress bar flips emerald when the daily goal is met; undo button reverses the last add. Storage in canonical ml; display converts to oz for lbs users. Daily goal lives on the profile with a 2 L default.
- **Body measurements + weight chart** (Recharts) with a smooth area line, hover crosshair, lowest/avg/highest stats, and configurable units (lb/kg, in/cm).
- **Settings** — `/app` Settings tab with three sections. Appearance: light / dark / system theme (persisted on `profiles.theme` for cross-device sync + `localStorage` for FOUC-free first paint). Preferences: hide the rest timer, hide the streak card. Account: change password via Supabase Auth. Toggle changes patch through TanStack Query optimistically so the UI flips instantly.
- **Dark mode** — full app dark theme via Tailwind v4 class-based `dark:` variant. Inline bootstrap script in `<head>` applies the theme before React mounts (no flash), system preference auto-tracked when in 'system' mode, cross-tab sync via the `storage` event. Implementation in [lib/theme.tsx](lib/theme.tsx).
- **Meal plan builder polish** — quantity inputs split into amount + unit dropdown (`g, oz, ml, cup, tbsp, tsp, piece, slice, scoop, Other…`) serialized into the existing `quantity` text column so no migration is needed; legacy values like "1/2 cup" auto-flip into "Other" mode on edit. Ingredient name fields type-ahead from the coach's own previously-saved ingredients ([useIngredientCatalog](lib/hooks/use-ingredient-catalog.ts)) — picking a suggestion bulk-fills name + qty + macros in one state update, so the same chicken-breast row isn't re-typed across plans.
- **Today dashboard momentum cards** — above the per-feature cards, the trainee now sees a "This week" tile (workout days, sets logged, volume lifted, each with a ↑/↓ delta vs. the prior 7 days), an "Unfinished" banner when a workout from the last 3 days was started but not completed (tap to resume), and — during the first week of each month — a one-time, dismissible "Last month recap" card showing the prior month's totals.
- **Workout celebration** — finishing the last prescribed set of the day fires a success toast summarizing the session (`Workout complete · 22 sets · 245 reps · 12,500 lb volume · 18:30`). The trigger is gated on a user-driven completion, so reopening a finished day doesn't re-fire.
- **Personal Records surfacing** — the Progress view now leads with a "Recent personal records" card listing the 5 most recently set lifetime bests across every exercise. Strength rows that beat their weight × reps PR also show an `e1RM 195` chip (Epley estimate, clamped to ≤12 reps) inline with the heaviest figure.
- **Inline cardio pace hint** — typing a treadmill (or other "speed" cardio) speed renders an immediate `≈ 8:30 /mi` (or `/km` for kg users) chip under the input, derived from the user's weight-unit preference.
- **Mini-logger affordances** — the Today workout card's inline next-set form shakes the input row when submitted with an empty required field (instead of just disabling the button, which used to swallow the Enter-to-submit reflex). The shake respects `prefers-reduced-motion`.

### Cross-cutting UX
- **URL-driven dashboard tabs** (`?tab=my-workouts`) so reload, back/forward, and deep links all preserve the active section.
- **Bottom tab bar on mobile** — primary nav is Workouts / Meals / Body / More. The "More" slot opens the full drawer with coaching tabs and Progress.
- **Sticky save bars** with iOS safe-area padding, exercise-count summary, and `loading` state.
- **Unsaved-changes guard** on every builder — closing or backing out with edits prompts a confirm dialog instead of silently dropping changes.
- **Loading toolkit**: `Spinner`, `Skeleton`, `LoadingState`, plus skeletons shaped to match the destination (card grids, list rows, tables) so layouts don't shift in.
- **Toast deduplication** — identical messages within 1.5s collapse, so a flaky save retry doesn't stack two error toasts.
- **Offline-aware PWA shell** — a hand-written service worker (`public/sw.js`, no framework deps) caches Next.js JS/CSS chunks (cache-first w/ background revalidate) and recent navigations (network-first w/ cached fallback). Supabase REST/Auth requests are passed through untouched so session state never goes stale. A bundled `/offline.html` is the last-resort fallback. An `OfflineBanner` appears the moment `navigator.onLine` flips false.
- **Offline read cache** — high-value reads (today's workouts/meals, weight log, body measurements) flow through `cachedQuery` / `cachedFetch` ([lib/cached-query.ts](lib/cached-query.ts)) backed by IndexedDB via `idb` ([lib/offline-cache.ts](lib/offline-cache.ts)). When the browser is offline, the wrapper short-circuits the network roundtrip and returns the most recently cached payload instead of hanging. The cache is cleared on signout so a shared device can't leak the previous account's snapshot to the next.
- **Offline write queue** — set-log saves go through `queuedUpsert` ([lib/write-queue.ts](lib/write-queue.ts)) which persists the intent to IDB whenever the browser is offline or the live Supabase call hits a network error, then replays the queue FIFO on the next `online` event or app mount. Drain calls are coalesced so an overlapping mount + `online` doesn't double-apply. The `OfflineBanner` surfaces the queued count and switches to a green "Syncing N changes…" state during replay. Queue + cache are both wiped on signout.
- **Performance** — each dashboard tab mounts on first visit and stays mounted (CSS-hidden) thereafter via the `TabPanel` wrapper in [UnifiedDashboard](components/dashboard/UnifiedDashboard.tsx), so switching Workouts ↔ Meals is instant after the first paint. The three coach builders (Workout / MealPlan / Program) are `next/dynamic` so the ~3k LOC of form code stays out of the initial dashboard chunk. The 200 KB curated `exercise-catalog.json` is dynamically imported on first autocomplete focus. Prior-performance lookups in supersets are batched into a single 2-query round trip via `fetchPriorPerformanceBatch` ([lib/training.ts](lib/training.ts)) instead of N. Per-frame computations in `ClientMealPlanView` (daily macro totals, missed-meal scan) and `SupersetLogger` (per-round completion) are `useMemo`'d. Supabase indexes on hot read paths land in [migration 15](supabase/migrations/15_perf_indexes.sql). `WeightChart` is wrapped in `React.memo` so Recharts doesn't rebuild on unrelated parent state changes.
- **Security** — invite codes now use `crypto.getRandomValues` over a 30-char Crockford-style base32 alphabet (10 chars ≈ 49 bits entropy, vs the previous ~40-bit `Math.random` path which was brute-forceable in days). Migration 16 adds defensive RLS policies so every assignment / log / profile row is constrained server-side to its owning user — the client UI was already checking ownership, but RLS closes the path where a hand-crafted REST call would bypass it. Invite redemption is intentionally left to the existing schema policy; the in-code comment in [migration 16](supabase/migrations/16_security_hardening.sql) documents the SECURITY DEFINER RPC pattern as the proper fix when invite-table SELECT is tightened.

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4**
- **Supabase** — Postgres, Auth, Row Level Security
- **Recharts** — weight progress chart
- **@dnd-kit** — drag-and-drop reordering
- **date-fns** + **react-day-picker** — date input
- **lucide-react** — icons

## Getting started

### Prerequisites
- Node.js 18+
- A Supabase project (free tier works)

### 1. Clone + install

```bash
git clone <repo>
cd coachflow
npm install
```

### 2. Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

(Found at **Supabase → Project Settings → API**.)

### 3. Database

This project's schema evolved across many additive migrations during development. The consolidated SQL needed to bring a fresh Supabase project up to date is collected in `supabase/migrations/`. Run them top-to-bottom in the **SQL Editor**, then run:

```sql
NOTIFY pgrst, 'reload schema';
```

The schema includes:

| Area | Tables |
| --- | --- |
| Identity | `profiles` (with `length_unit`, `weight_unit`, `weight_goal`, `rest_timer_enabled`, `show_streak_card`, `theme`, `water_daily_goal_ml`) |
| Coaching | `coach_client_relationships`, `invite_codes` (with `expires_at`, `revoked_at`, `max_uses`) |
| Workouts | `workouts`, `exercises`, `exercise_sets`, `exercise_alternatives` |
| Programs | `workout_programs`, `workout_program_workouts`, `program_assignments` |
| Assignments | `workout_assignments` (with `cycle_anchor_date`) |
| Logs | `set_logs` (with `logged_date` for progressive overload), `exercise_substitutions` |
| Nutrition | `meal_plans`, `meals`, `foods`, `ingredients`, `food_alternatives`, `meal_plan_assignments`, `meal_logs` |
| Tracking | `weight_logs`, `body_measurements`, `water_logs` |

All tables enable **Row Level Security**. Trainees see only their own data; coaches see their clients' assignments, set/meal logs, and substitutions through the `coach_client_relationships` join.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

## How it's wired

### The unified user model
There is no `role` flag. Every account is both a coach and a trainee:
- A self-coaching `coach_client_relationships` row (`coach_id = client_id`) is created on first dashboard load, so anyone can assign themselves workouts and meal plans.
- An invite link (`/invite?code=…`) creates an additional relationship where another user is the coach. A user can be coached by multiple people and coach multiple clients simultaneously.

### Scheduling
Workouts and meals support two scheduling modes:

- **Weekly** (default): `days_of_week SMALLINT[]` (Sun=0…Sat=6). Empty array = every day.
- **N-day rotation**: `cycle_length` + `cycle_position` on the workout, `cycle_anchor_date` on the assignment. The trainee view computes today's position as `(daysSince(anchor) mod length) + 1` and matches against `cycle_position`. Lets coaches build 8-day, 5-day, 6-on-1-off splits without forcing them into a 7-day grid.

### Progressive overload
- `set_logs` is keyed `(assignment_id, exercise_id, set_number, logged_date)`. Same workout next week creates new rows instead of overwriting last week's.
- `exercise_substitutions` records which alternative was active per `(assignment_id, exercise_id, logged_date)`.
- The "Last: 135 × 8" hint pulls the most recent prior log whose substitution variant matches today's. So when you swap to goblet squat for one day and go back to barbell next week, the hint compares against the most recent barbell session — not last week's goblet.

### Diff-based builder saves
[`WorkoutBuilder.handleSave`](components/coaching/WorkoutBuilder.tsx) does not delete-and-reinsert. It:
1. Pulls server-side exercise IDs.
2. Deletes only exercises the form removed (cascades their `set_logs`).
3. Updates surviving exercises in place — `exercise_id` stays stable so all logs and substitutions remain attached.
4. Inserts new exercises and maps returned IDs back via `order_index`.
5. Replaces `exercise_sets` and `exercise_alternatives` per surviving exercise (these are prescription metadata; nothing in the DB references their IDs).

The builder also detects "promote alternative to main" swaps and back-fills `exercise_substitutions` so historical sessions remain correctly labeled.

## Project layout

```
coachflow/
├── app/
│   ├── dashboard/                  # Server-rendered shell + Suspense boundary
│   ├── login/, signup/, invite/    # Auth + onboarding
│   └── globals.css                 # Tokens, animations, iOS quirks
├── components/
│   ├── coaching/                   # Coach-side: builders, libraries, modals
│   │   ├── ScheduleSection.tsx
│   │   ├── assignments/            # Workout/MealPlan/Program assign modals
│   │   │                           # + shared AssignmentSchedulingFields
│   │   ├── clients/                # ClientList, ClientDetailView,
│   │   │                           # InviteCodeGenerator
│   │   ├── workouts/               # WorkoutBuilder, WorkoutLibrary,
│   │   │                           # persistence.ts (diff-based save)
│   │   ├── meal-plans/             # MealPlanBuilder, MealPlanLibrary,
│   │   │                           # MealCard, persistence.ts
│   │   └── programs/               # ProgramBuilder, ProgramLibrary
│   ├── training/                   # Trainee-side: assigned views + loggers
│   │   ├── TodayDashboard.tsx
│   │   ├── today/                  # Per-card components for Today
│   │   ├── logger/                 # ExerciseSetLogger, SupersetLogger,
│   │   │                           # SubstitutionPicker, SetHints (shared)
│   │   ├── workouts/ClientWorkoutView.tsx
│   │   ├── meals/                  # ClientMealPlanView, MealLogToggle
│   │   ├── measurements/           # WeightTracker, WeightChart,
│   │   │                           # WeightShareDialog, BodyTracker,
│   │   │                           # MeasurementForm/Tracker, UnitToggle
│   │   └── history/                # WorkoutHistory + ActivityHeatmap +
│   │                               # SummaryTile
│   ├── dashboard/                  # UnifiedDashboard + NavSectionList +
│   │                               # MobileBottomNav + tabs.tsx
│   └── ui/                         # Buttons, inputs, modal, toast, skeletons,
│                                   # SortableList, LibraryFilterableGrid, etc.
├── lib/
│   ├── queries.ts                  # Centralized assignment fetchers
│   ├── training.ts                 # buildPrescribedSets, fetchPriorPerformance,
│   │                               # isImprovement, formatPriorHint
│   ├── utils.ts                    # Date helpers, fraction parse/format,
│   │                               # duration helpers, macro math, pace
│   ├── hooks/
│   │   ├── use-assignment-sync.ts  # Single source for post-write cache
│   │   │                           # invalidations across every assignment
│   │   │                           # writer
│   │   ├── use-clients.ts          # Roster + last-active dates (split into
│   │   │                           # two queries for progressive paint)
│   │   ├── use-set-logs.ts         # Day + exercise set-log queries +
│   │   │                           # the save mutation
│   │   └── use-*.ts                # Per-resource queries
│   ├── use-dirty-state.ts          # Snapshot-based dirty detection
│   ├── use-supabase.ts             # Memoized client
│   └── supabase/                   # Browser/server/middleware clients
├── supabase/migrations/            # SQL migrations (additive, idempotent)
└── proxy.ts                        # Next.js middleware for auth refresh
```

## Conventions

- **No `any`** at boundaries — Supabase row shapes are explicitly typed in `lib/queries.ts`.
- **Local time everywhere user-visible.** Date helpers in `lib/utils.ts` (`parseLocalISO`, `weekdayOf`, `daysBetween` etc.) avoid the `new Date('YYYY-MM-DD')` UTC trap.
- **Optimistic UI** for fire-and-forget actions (meal toggle, substitution picker), with rollback + toast on error.
- **Skeleton-first loading** — every fetch site renders a skeleton shaped like the eventual content so layouts don't shift.

## Deploy

Deploys cleanly on Vercel. Push to a Git remote, import in Vercel, set the two `NEXT_PUBLIC_SUPABASE_*` env vars, and the build runs as `next build` (Turbopack).

## License

MIT
