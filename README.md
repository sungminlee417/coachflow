# CoachFlow

A coaching-and-training platform where every user can both coach and train. One account, two hats — assign yourself a workout, or grab an invite code and let someone else coach you. Built on Next.js 16 + Supabase, mobile-first, no role flag to manage.

## Highlights

### For coaches
- **Workout builder** with strength + cardio exercises, supersets (chains of `pair_with_next`), per-set prescriptions, alternatives that the trainee can swap to, and either weekly or N-day rotation scheduling.
- **Drag-and-drop** reordering for exercises, alternatives, and workouts inside programs (`@dnd-kit`, mouse + touch + keyboard).
- **Programs** group workouts together (Push/Pull/Legs, beginner plan, etc.). Assigning a program creates one `workout_assignments` row per member workout — no separate "program assignment" entity, so existing per-workout assignments aren't disturbed.
- **Meal-plan builder** with meals → foods → optional ingredients, auto-rolled-up macros, days-of-week scheduling, and optional time-of-day. Meals can be **duplicated** (deep copy of foods + ingredients) and reorder via drag-and-drop. Times auto-sort meals chronologically; untimed meals follow in manual order.
- **Invite-based client onboarding** (`/invite?code=…`).
- **Diff-based saves** preserve `exercise_id` (workouts) and `meal_id` (meal plans) across edits. Renaming, reordering, swapping types, editing alternatives, duplicating a meal — none of those touch the trainee's `set_logs` or `meal_logs`. Only explicitly removing a row cascades.

### For trainees
- **Daily workout view** with a week strip + arrow navigation (past and future weeks), per-set logging that auto-saves on blur, and an `aria-live` daily progress chip.
- **Progressive overload hints**: `Last: 135 × 8` ghosts in below each input, plus an emerald `↑ Beat last` pill the moment you type values that beat last week. Variant-aware — barbell-squat days compare against barbell-squat history, goblet-squat days compare against goblet-squat history.
- **Substitution chips** under each exercise (`or: Goblet Squat · Leg Press · Hack Squat`). Tap to swap; one-tap revert. Per-day, per-assignment scope so a swap doesn't bleed across workouts.
- **Auto-collapse on completion** — finished sets and finished superset rounds collapse to a one-line summary (`Set 1 · ✓ · 135 × 8`); tap to re-expand if you misclicked, with an in-row "↑ Collapse" link to fold it back.
- **Cardio support** — duration in `mm:ss`, `1h 20m`, or bare-number minutes; intervals supported.
- **Meal logging** — per-day check on each meal with a daily "X / Y eaten" chip; coach can see their clients' check history via RLS.
- **Body measurements + weight chart** (Recharts) with a smooth area line, hover crosshair, lowest/avg/highest stats, and configurable units (lb/kg, in/cm).

### Cross-cutting UX
- **URL-driven dashboard tabs** (`?tab=my-workouts`) so reload, back/forward, and deep links all preserve the active section.
- **Sticky save bars** with iOS safe-area padding, exercise-count summary, and `loading` state.
- **Unsaved-changes guard** on every builder — closing or backing out with edits prompts a confirm dialog instead of silently dropping changes.
- **Loading toolkit**: `Spinner`, `Skeleton`, `LoadingState`, plus skeletons shaped to match the destination (card grids, list rows, tables) so layouts don't shift in.
- **Toast deduplication** — identical messages within 1.5s collapse, so a flaky save retry doesn't stack two error toasts.

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
| Identity | `profiles` (with `length_unit`, `weight_unit`) |
| Coaching | `coach_client_relationships`, `invite_codes` |
| Workouts | `workouts`, `exercises`, `exercise_sets`, `exercise_alternatives` |
| Programs | `workout_programs`, `workout_program_workouts` |
| Assignments | `workout_assignments` (with `cycle_anchor_date`) |
| Logs | `set_logs` (with `logged_date` for progressive overload), `exercise_substitutions` |
| Nutrition | `meal_plans`, `meals`, `foods`, `ingredients`, `meal_plan_assignments`, `meal_logs` |
| Tracking | `weight_logs`, `body_measurements` |

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
│   │   ├── WorkoutBuilder.tsx
│   │   ├── ScheduleSection.tsx
│   │   ├── ProgramBuilder.tsx
│   │   ├── MealPlanBuilder.tsx
│   │   └── …AssignmentModal.tsx
│   ├── training/                   # Trainee-side: assigned views + loggers
│   │   ├── ClientWorkoutView.tsx
│   │   ├── ExerciseSetLogger.tsx, SupersetLogger.tsx
│   │   ├── SubstitutionPicker.tsx
│   │   ├── MealLogToggle.tsx
│   │   ├── WeightChart.tsx
│   │   └── MeasurementsTracker.tsx
│   ├── dashboard/UnifiedDashboard.tsx
│   └── ui/                         # Buttons, inputs, modal, toast, skeletons,
│                                   # SortableList, etc.
├── lib/
│   ├── queries.ts                  # Centralized assignment fetchers
│   ├── training.ts                 # buildPrescribedSets, fetchPriorPerformance,
│   │                               # isImprovement, formatPriorHint
│   ├── utils.ts                    # Date helpers, fraction parse/format,
│   │                               # duration helpers, macro math
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
