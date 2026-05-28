// WorkoutBuilder load + save split out of WorkoutBuilder.tsx — pure
// data transforms that don't need to live inside a React component.
// The component owns the loading flag, toasts, and form state; this
// module handles the Supabase chatter and the diff-based sync.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DayOfWeek,
  Exercise,
  ExerciseSet,
  ExerciseType,
} from '@/lib/types'
import { formatDuration, parseDuration } from '@/lib/utils'

export type DraftExercise = Exercise & { _dndKey: string }

// While editing a cardio set, the user's text lives in `target_reps` so
// we don't need separate edit-state. On load, hydrate it from the
// canonical `target_duration_seconds` so the input shows a human value.
function hydrateCardioInputs(sets: ExerciseSet[]): ExerciseSet[] {
  return sets.map(s => ({
    ...s,
    target_reps:
      s.target_duration_seconds != null && s.target_duration_seconds > 0
        ? formatDuration(s.target_duration_seconds)
        : s.target_reps,
  }))
}

// Build initial exercise_sets when an exercise has none yet — derive
// from legacy `sets` count + flat reps so existing workouts render.
function seedSetsFromLegacy(ex: Exercise): ExerciseSet[] {
  const count = Math.max(1, ex.sets ?? 1)
  return Array.from({ length: count }, (_, i) => ({
    set_number: i + 1,
    target_reps: ex.reps ?? '',
    target_duration_seconds: null,
    notes: '',
  }))
}

/**
 * Fetch all exercises for a workout, normalised into the editable
 * `DraftExercise` shape the builder uses in local state.
 */
export async function loadWorkoutExercises(
  supabase: SupabaseClient,
  workoutId: string
): Promise<DraftExercise[]> {
  const { data: exerciseRows, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('workout_id', workoutId)
    .order('order_index')
  if (error) throw error
  const exerciseList = exerciseRows ?? []
  if (exerciseList.length === 0) return []

  const ids = exerciseList.map(e => e.id)

  let setsByExercise = new Map<string, ExerciseSet[]>()
  try {
    const { data: setRows } = await supabase
      .from('exercise_sets')
      .select(
        'id, exercise_id, set_number, target_reps, target_duration_seconds, notes, target_speed, target_incline, target_resistance'
      )
      .in('exercise_id', ids)
    setsByExercise = (
      (setRows ?? []) as Array<ExerciseSet & { exercise_id: string }>
    ).reduce((map, s) => {
      const arr = map.get(s.exercise_id) ?? []
      arr.push(s)
      map.set(s.exercise_id, arr)
      return map
    }, new Map<string, ExerciseSet[]>())
  } catch {
    // Fall back to legacy-derived sets if the second query fails.
  }

  // Same defensive split for alternatives — if the table doesn't exist
  // yet (migration pending) the form should still render.
  const altsByExercise = new Map<string, string[]>()
  try {
    const { data: altRows } = await supabase
      .from('exercise_alternatives')
      .select('exercise_id, name, order_index')
      .in('exercise_id', ids)
      .order('order_index', { ascending: true })
    for (const a of (altRows ?? []) as {
      exercise_id: string
      name: string
      order_index: number
    }[]) {
      const arr = altsByExercise.get(a.exercise_id) ?? []
      arr.push(a.name)
      altsByExercise.set(a.exercise_id, arr)
    }
  } catch {
    // Alternatives are optional — silently skip if unavailable.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return exerciseList.map((ex: any) => {
    const sets = (setsByExercise.get(ex.id) ?? [])
      .slice()
      .sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number)
    const baseSets = sets.length > 0 ? sets : seedSetsFromLegacy(ex)
    const type: ExerciseType =
      ex.exercise_type === 'cardio' ? 'cardio' : 'strength'
    return {
      ...ex,
      exercise_type: type,
      alternatives: altsByExercise.get(ex.id) ?? [],
      exercise_sets: type === 'cardio' ? hydrateCardioInputs(baseSets) : baseSets,
      // Reuse the server id as the DnD key so identity is stable across
      // unrelated state updates.
      _dndKey: ex.id,
    }
  })
}

export interface SaveWorkoutArgs {
  coachId: string
  existingWorkoutId: string | undefined
  name: string
  description: string
  isTemplate: boolean
  scheduleMode: 'cycle' | 'weekly'
  cycleLength: number
  cyclePosition: number
  daysOfWeek: DayOfWeek[]
  exercises: DraftExercise[]
}

/**
 * Diff-based workout save.
 *
 *   • Upsert the workouts row (sanitising the schedule columns so a
 *     stale value can't haunt a switched-mode workout).
 *   • Read the existing exercises + alternatives, compute the diff
 *     against the form, delete removed rows (CASCADE wipes their
 *     set_logs / exercise_substitutions intentionally), update
 *     survivors in place to preserve exercise_id (so client logs
 *     keyed on it survive), insert new ones.
 *   • Detect promoted alternatives (old main is now an alt; one of the
 *     old alts is now main) and backfill exercise_substitutions so
 *     past set_logs stay variant-tagged after the rename.
 *   • Exercise_sets + exercise_alternatives are children of exercises
 *     with no client references → wipe-and-reinsert.
 *
 * Throws on real Supabase errors; the caller surfaces a toast.
 */
export async function saveWorkout(
  supabase: SupabaseClient,
  args: SaveWorkoutArgs
): Promise<void> {
  const {
    coachId,
    existingWorkoutId,
    name,
    description,
    isTemplate,
    scheduleMode,
    cycleLength,
    cyclePosition,
    daysOfWeek,
    exercises,
  } = args

  let workoutId = existingWorkoutId

  // Only write the schedule columns belonging to the active mode; the
  // others are nulled so a stale value can't haunt a switched-modes workout.
  const isCycle = scheduleMode === 'cycle'
  const sanitizedLength = Math.max(1, Math.min(60, Math.floor(cycleLength) || 1))
  const sanitizedPosition = Math.max(
    1,
    Math.min(sanitizedLength, Math.floor(cyclePosition) || 1)
  )
  const schedulePayload = isCycle
    ? {
        days_of_week: [],
        cycle_length: sanitizedLength,
        cycle_position: sanitizedPosition,
      }
    : {
        days_of_week: daysOfWeek,
        cycle_length: null,
        cycle_position: null,
      }

  if (workoutId) {
    const { error } = await supabase
      .from('workouts')
      .update({
        name,
        description,
        is_template: isTemplate,
        ...schedulePayload,
      })
      .eq('id', workoutId)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from('workouts')
      .insert({
        coach_id: coachId,
        name,
        description,
        is_template: isTemplate,
        ...schedulePayload,
      })
      .select()
      .single()
    if (error) throw error
    workoutId = data.id
  }

  // ── Diff-based exercise sync ───────────────────────────────────────
  const exerciseFields = (ex: DraftExercise, formIndex: number) => ({
    name: ex.name,
    exercise_type: ex.exercise_type ?? 'strength',
    sets: ex.exercise_sets?.length ?? null,
    reps: ex.exercise_sets?.[0]?.target_reps ?? ex.reps ?? '',
    weight: '',
    rest_seconds: ex.rest_seconds,
    notes: ex.notes,
    order_index: formIndex,
    pair_with_next:
      formIndex < exercises.length - 1 ? !!ex.pair_with_next : false,
    catalog_id: ex.catalog_id ?? null,
    cardio_subtype:
      ex.exercise_type === 'cardio' ? ex.cardio_subtype ?? null : null,
  })

  // 1) Find what the server has now (with main names + alternatives) so
  // promotion detection has something to compare against.
  const serverIds = new Set<string>()
  const serverNameById = new Map<string, string>()
  const serverAltsById = new Map<string, string[]>()
  if (existingWorkoutId) {
    const { data: existing } = await supabase
      .from('exercises')
      .select('id, name')
      .eq('workout_id', workoutId)
    for (const r of (existing ?? []) as { id: string; name: string }[]) {
      serverIds.add(r.id)
      serverNameById.set(r.id, r.name)
    }
    if (serverIds.size > 0) {
      try {
        const { data: altRows } = await supabase
          .from('exercise_alternatives')
          .select('exercise_id, name, order_index')
          .in('exercise_id', Array.from(serverIds))
          .order('order_index', { ascending: true })
        for (const a of (altRows ?? []) as {
          exercise_id: string
          name: string
        }[]) {
          const arr = serverAltsById.get(a.exercise_id) ?? []
          arr.push(a.name)
          serverAltsById.set(a.exercise_id, arr)
        }
      } catch {
        // Alternatives table may not exist on older deployments.
      }
    }
  }

  const formIdSet = new Set(
    exercises.map(ex => ex.id).filter((id): id is string => !!id)
  )

  // 2) Delete exercises the coach removed from the form. CASCADE here
  // is intentional — set_logs / exercise_substitutions for these rows
  // go too.
  const toDeleteIds = Array.from(serverIds).filter(id => !formIdSet.has(id))
  if (toDeleteIds.length > 0) {
    const { error } = await supabase
      .from('exercises')
      .delete()
      .in('id', toDeleteIds)
    if (error) throw error
  }

  // 2.5) Detect alternative→main promotions and rewrite history so
  // progressive-overload comparisons stay variant-aware.
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]
    if (!ex.id || !serverIds.has(ex.id)) continue
    const oldMain = serverNameById.get(ex.id)
    if (!oldMain || oldMain === ex.name) continue
    const oldAlts = serverAltsById.get(ex.id) ?? []
    const newMain = ex.name
    const newAlts = ex.alternatives ?? []
    const isPromotion =
      oldAlts.includes(newMain) && newAlts.includes(oldMain)
    if (!isPromotion) continue

    try {
      const { data: logRows } = await supabase
        .from('set_logs')
        .select('assignment_id, logged_date')
        .eq('exercise_id', ex.id)
      const pairs = Array.from(
        new Set(
          (logRows ?? []).map(
            (r: { assignment_id: string; logged_date: string }) =>
              `${r.assignment_id}::${r.logged_date}`
          )
        )
      ).map(s => {
        const [assignment_id, logged_date] = s.split('::')
        return { assignment_id, logged_date }
      })

      if (pairs.length > 0) {
        const { data: subRows } = await supabase
          .from('exercise_substitutions')
          .select('assignment_id, logged_date')
          .eq('exercise_id', ex.id)
          .in(
            'assignment_id',
            Array.from(new Set(pairs.map(p => p.assignment_id)))
          )
        const subbed = new Set(
          (subRows ?? []).map(
            (r: { assignment_id: string; logged_date: string }) =>
              `${r.assignment_id}::${r.logged_date}`
          )
        )
        const toBackfill = pairs.filter(
          p => !subbed.has(`${p.assignment_id}::${p.logged_date}`)
        )
        if (toBackfill.length > 0) {
          await supabase.from('exercise_substitutions').insert(
            toBackfill.map(p => ({
              assignment_id: p.assignment_id,
              exercise_id: ex.id,
              logged_date: p.logged_date,
              substituted_name: oldMain,
            }))
          )
        }
      }
    } catch {
      // Backfill is best-effort — never block the promotion itself on
      // a substitutions-table error.
    }
  }

  // 2.6) For every promoted exercise, drop substitutions whose name
  // matches the new main — they're no longer swaps. Separate pass so
  // we don't delete what we just inserted in step 2.5.
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]
    if (!ex.id || !serverIds.has(ex.id)) continue
    const oldMain = serverNameById.get(ex.id)
    if (!oldMain || oldMain === ex.name) continue
    const oldAlts = serverAltsById.get(ex.id) ?? []
    const newAlts = ex.alternatives ?? []
    if (!(oldAlts.includes(ex.name) && newAlts.includes(oldMain))) continue
    try {
      await supabase
        .from('exercise_substitutions')
        .delete()
        .eq('exercise_id', ex.id)
        .eq('substituted_name', ex.name)
    } catch {
      // best-effort
    }
  }

  // 3) Update exercises that survived (preserves exercise_id → keeps logs).
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]
    if (!ex.id || !serverIds.has(ex.id)) continue
    const { error } = await supabase
      .from('exercises')
      .update(exerciseFields(ex, i))
      .eq('id', ex.id)
    if (error) throw error
  }

  // 4) Insert newly added exercises in one batch and capture their ids.
  const newRows = exercises
    .map((ex, i) => ({ ex, i }))
    .filter(({ ex }) => !ex.id || !serverIds.has(ex.id))
  const insertedIdByOrderIndex = new Map<number, string>()
  if (newRows.length > 0) {
    const { data: inserted, error } = await supabase
      .from('exercises')
      .insert(
        newRows.map(({ ex, i }) => ({
          workout_id: workoutId,
          ...exerciseFields(ex, i),
        }))
      )
      .select('id, order_index')
    if (error) throw error
    for (const r of (inserted ?? []) as {
      id: string
      order_index: number
    }[]) {
      insertedIdByOrderIndex.set(r.order_index, r.id)
    }
  }

  const exerciseIdAt = (formIndex: number): string => {
    const ex = exercises[formIndex]
    if (ex.id && serverIds.has(ex.id)) return ex.id
    const fresh = insertedIdByOrderIndex.get(formIndex)
    if (!fresh) throw new Error('Missing inserted id for new exercise')
    return fresh
  }
  const allExerciseIds = exercises.map((_, i) => exerciseIdAt(i))

  // 5) Replace exercise_sets and exercise_alternatives for every
  // surviving exercise. set_logs reference exercise_id (not
  // exercise_sets.id), and exercise_substitutions reference
  // exercise_id (not exercise_alternatives.id), so wiping these child
  // rows does NOT touch client logs.
  if (allExerciseIds.length > 0) {
    const { error: setDelErr } = await supabase
      .from('exercise_sets')
      .delete()
      .in('exercise_id', allExerciseIds)
    if (setDelErr) throw setDelErr
    try {
      await supabase
        .from('exercise_alternatives')
        .delete()
        .in('exercise_id', allExerciseIds)
    } catch {
      // best-effort
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setsToInsert: any[] = []
  exercises.forEach((ex, i) => {
    const exId = allExerciseIds[i]
    const isCardio = ex.exercise_type === 'cardio'
    ;(ex.exercise_sets ?? []).forEach(s => {
      const durationSeconds = isCardio ? parseDuration(s.target_reps) : null
      setsToInsert.push({
        exercise_id: exId,
        set_number: s.set_number,
        target_reps: isCardio ? '' : s.target_reps,
        target_duration_seconds: durationSeconds,
        notes: s.notes,
        target_speed: isCardio ? s.target_speed ?? null : null,
        target_incline: isCardio ? s.target_incline ?? null : null,
        target_resistance: isCardio ? s.target_resistance ?? null : null,
      })
    })
  })
  if (setsToInsert.length > 0) {
    const { error } = await supabase
      .from('exercise_sets')
      .insert(setsToInsert)
    if (error) throw error
  }

  const altsToInsert: { exercise_id: string; name: string; order_index: number }[] = []
  exercises.forEach((ex, i) => {
    const exId = allExerciseIds[i]
    ;(ex.alternatives ?? [])
      .map(n => n.trim())
      .filter(n => n.length > 0)
      .forEach((name, j) => {
        altsToInsert.push({ exercise_id: exId, name, order_index: j })
      })
  })
  if (altsToInsert.length > 0) {
    // Best-effort — if the alternatives table doesn't exist on this
    // deployment yet, the rest of the save still succeeded.
    await supabase.from('exercise_alternatives').insert(altsToInsert)
  }
}
