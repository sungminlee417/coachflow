// Meal-plan load + save split out of MealPlanBuilder.tsx — pure data
// transforms that don't need to live inside a React component. Both
// functions take a Supabase client + plain values; the component owns
// the loading flags and toasts.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DayOfWeek,
  Food,
  Ingredient,
  Meal,
  MealType,
} from '@/lib/types'

export type DraftMeal = Meal & { _dndKey: string }

// Sort: timed meals first chronologically, then untimed last by their
// original order. Matches the read-side order in queries.ts.
function sortMealsByTime(meals: DraftMeal[]): DraftMeal[] {
  const timed = meals.filter(m => m.time)
  const untimed = meals.filter(m => !m.time)
  timed.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  return [...timed, ...untimed]
}

/**
 * Fetch + normalize the meals (with nested foods, ingredients, and
 * food_alternatives) for a saved meal plan. Returns the DraftMeal
 * shape the builder edits in local state.
 */
export async function loadMealPlanMeals(
  supabase: SupabaseClient,
  planId: string
): Promise<DraftMeal[]> {
  const { data: mealRows, error } = await supabase
    .from('meals')
    .select(
      '*, foods ( *, ingredients (*), food_alternatives ( id, name, quantity, calories, protein_grams, carbs_grams, fat_grams, order_index ) )'
    )
    .eq('meal_plan_id', planId)
    .order('order_index')
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized: DraftMeal[] = (mealRows ?? []).map((m: any) => ({
    ...m,
    days_of_week: (m.days_of_week ?? []) as DayOfWeek[],
    // Normalize "HH:MM:SS" → "HH:MM" so it works in <input type="time">.
    time: m.time ? String(m.time).slice(0, 5) : null,
    foods: (m.foods ?? [])
      .slice()
      .sort((a: Food, b: Food) => a.order_index - b.order_index)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((f: any) => ({
        ...f,
        ingredients: (f.ingredients ?? [])
          .slice()
          .sort(
            (a: Ingredient, b: Ingredient) => a.order_index - b.order_index
          ),
        alternatives: (
          (f.food_alternatives ?? []) as Array<{
            id?: string
            name: string
            quantity: string | null
            calories: number | null
            protein_grams: number | null
            carbs_grams: number | null
            fat_grams: number | null
            order_index: number
          }>
        )
          .slice()
          .sort((a, b) => a.order_index - b.order_index)
          .map(alt => ({
            id: alt.id,
            name: alt.name,
            quantity: alt.quantity ?? '',
            calories: alt.calories,
            protein_grams: alt.protein_grams,
            carbs_grams: alt.carbs_grams,
            fat_grams: alt.fat_grams,
            order_index: alt.order_index,
          })),
      })),
    // Reuse the server id as the DnD key so identity is stable across
    // unrelated state updates.
    _dndKey: m.id,
  }))
  return sortMealsByTime(normalized)
}

export interface SaveMealPlanArgs {
  coachId: string
  existingPlanId: string | undefined
  name: string
  description: string
  isTemplate: boolean
  meals: DraftMeal[]
}

/**
 * Diff-based meal sync.
 *
 *   • Update the meal_plans row (or insert if new).
 *   • Compare server meal ids vs current form ids — delete removed meals
 *     (CASCADE wipes their meal_logs intentionally, since the meal is
 *     gone), update survivors in place (preserves meal_id so logs that
 *     still point at them survive), insert new ones.
 *   • Foods + ingredients + food_alternatives are children of meals with
 *     no external references, so they go through a wipe-and-reinsert.
 *
 * Returns nothing; throws on real Supabase errors so the caller can
 * surface a toast.
 */
export async function saveMealPlan(
  supabase: SupabaseClient,
  args: SaveMealPlanArgs
): Promise<void> {
  const { coachId, existingPlanId, name, description, isTemplate, meals } = args

  let planId = existingPlanId
  if (planId) {
    const { error } = await supabase
      .from('meal_plans')
      .update({ name, description, is_template: isTemplate })
      .eq('id', planId)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from('meal_plans')
      .insert({ coach_id: coachId, name, description, is_template: isTemplate })
      .select()
      .single()
    if (error) throw error
    planId = data.id
  }

  // 1) Read what's currently on the server.
  const serverMealIds = new Set<string>()
  if (existingPlanId) {
    const { data: existingRows } = await supabase
      .from('meals')
      .select('id')
      .eq('meal_plan_id', planId)
    for (const r of (existingRows ?? []) as { id: string }[]) {
      serverMealIds.add(r.id)
    }
  }

  const formMealIds = new Set(
    meals.map(m => m.id).filter((id): id is string => !!id)
  )

  // 2) Delete meals the coach removed.
  const mealsToDelete = Array.from(serverMealIds).filter(
    id => !formMealIds.has(id)
  )
  if (mealsToDelete.length > 0) {
    const { error } = await supabase
      .from('meals')
      .delete()
      .in('id', mealsToDelete)
    if (error) throw error
  }

  // Field set used for both update + insert.
  const mealFields = (m: DraftMeal, formIndex: number) => ({
    meal_type: m.meal_type as MealType,
    name: m.name,
    description: m.description,
    days_of_week: m.days_of_week,
    time: m.time || null,
    // Macros derived from foods/ingredients; never store stale values.
    calories: null,
    protein_grams: null,
    carbs_grams: null,
    fat_grams: null,
    order_index: formIndex,
  })

  // 3) Update surviving meals in place (preserves meal_id → keeps logs).
  for (let i = 0; i < meals.length; i++) {
    const m = meals[i]
    if (!m.id || !serverMealIds.has(m.id)) continue
    const { error } = await supabase
      .from('meals')
      .update(mealFields(m, i))
      .eq('id', m.id)
    if (error) throw error
  }

  // 4) Insert newly-added meals; capture ids by order_index.
  const newRows = meals
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !m.id || !serverMealIds.has(m.id))
  const insertedMealIdByOrderIndex = new Map<number, string>()
  if (newRows.length > 0) {
    const { data: inserted, error } = await supabase
      .from('meals')
      .insert(
        newRows.map(({ m, i }) => ({ meal_plan_id: planId, ...mealFields(m, i) }))
      )
      .select('id, order_index')
    if (error) throw error
    for (const r of (inserted ?? []) as { id: string; order_index: number }[]) {
      insertedMealIdByOrderIndex.set(r.order_index, r.id)
    }
  }

  const mealIdAt = (formIndex: number): string => {
    const m = meals[formIndex]
    if (m.id && serverMealIds.has(m.id)) return m.id
    const fresh = insertedMealIdByOrderIndex.get(formIndex)
    if (!fresh) throw new Error('Missing inserted meal id')
    return fresh
  }
  const allMealIds = meals.map((_, i) => mealIdAt(i))

  // 5) Replace foods + ingredients per surviving meal. Nothing outside
  // the meal plan references food_id / ingredient_id, so a wipe-and-
  // reinsert is safe and avoids a full per-row diff.
  if (allMealIds.length > 0) {
    const { error: foodDelErr } = await supabase
      .from('foods')
      .delete()
      .in('meal_id', allMealIds)
    if (foodDelErr) throw foodDelErr
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foodsToInsert: any[] = []
  const foodLocalRefs: { mealIndex: number; foodIndex: number }[] = []
  meals.forEach((m, mealIndex) => {
    const mealId = allMealIds[mealIndex]
    ;(m.foods ?? []).forEach((f, foodIndex) => {
      if (!f.name.trim()) return
      // If a food has ingredients, its own macro fields are derived → store null.
      const hasIngredients = (f.ingredients ?? []).some(ing => ing.name.trim())
      foodsToInsert.push({
        meal_id: mealId,
        name: f.name,
        quantity: hasIngredients ? '' : f.quantity,
        calories: hasIngredients ? null : f.calories,
        protein_grams: hasIngredients ? null : f.protein_grams,
        carbs_grams: hasIngredients ? null : f.carbs_grams,
        fat_grams: hasIngredients ? null : f.fat_grams,
        order_index: f.order_index,
      })
      foodLocalRefs.push({ mealIndex, foodIndex })
    })
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let insertedFoods: any[] = []
  if (foodsToInsert.length > 0) {
    const { data, error: foodError } = await supabase
      .from('foods')
      .insert(foodsToInsert)
      .select('id, meal_id, order_index')
    if (foodError) throw foodError
    insertedFoods = data ?? []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ingredientsToInsert: any[] = []
  foodLocalRefs.forEach((ref, i) => {
    const insertedFood = insertedFoods[i]
    if (!insertedFood) return
    const food = meals[ref.mealIndex].foods?.[ref.foodIndex]
    ;(food?.ingredients ?? []).forEach(ing => {
      if (!ing.name.trim()) return
      ingredientsToInsert.push({
        food_id: insertedFood.id,
        name: ing.name,
        quantity: ing.quantity,
        calories: ing.calories,
        protein_grams: ing.protein_grams,
        carbs_grams: ing.carbs_grams,
        fat_grams: ing.fat_grams,
        order_index: ing.order_index,
      })
    })
  })

  if (ingredientsToInsert.length > 0) {
    const { error: ingError } = await supabase
      .from('ingredients')
      .insert(ingredientsToInsert)
    if (ingError) throw ingError
  }

  // Food alternatives: parallel structure. Old rows were wiped via the
  // foods cascade-delete above, so this is pure insert. Each alt carries
  // its own quantity + macros so portions round-trip correctly.
  const altsToInsert: {
    food_id: string
    name: string
    quantity: string | null
    calories: number | null
    protein_grams: number | null
    carbs_grams: number | null
    fat_grams: number | null
    order_index: number
  }[] = []
  foodLocalRefs.forEach((ref, i) => {
    const insertedFood = insertedFoods[i]
    if (!insertedFood) return
    const food = meals[ref.mealIndex].foods?.[ref.foodIndex]
    ;(food?.alternatives ?? [])
      .filter(alt => alt.name.trim().length > 0)
      .forEach((alt, j) => {
        altsToInsert.push({
          food_id: insertedFood.id,
          name: alt.name.trim(),
          quantity: alt.quantity?.trim() ? alt.quantity.trim() : null,
          calories: alt.calories,
          protein_grams: alt.protein_grams,
          carbs_grams: alt.carbs_grams,
          fat_grams: alt.fat_grams,
          order_index: j,
        })
      })
  })
  if (altsToInsert.length > 0) {
    // Best-effort — if the table or new columns don't exist on this
    // deployment yet, the rest of the save still succeeded.
    await supabase.from('food_alternatives').insert(altsToInsert)
  }
}
