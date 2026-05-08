'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea, Select } from '@/components/ui/Input'
import { DayOfWeekSelector } from '@/components/ui/DayOfWeekSelector'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DragHandle, type DragHandleProps } from '@/components/ui/SortableList'
import { useDirtyState } from '@/lib/use-dirty-state'
import { ArrowLeft, Plus, X, ChevronDown, Save, ChevronRight, Copy } from 'lucide-react'
import { computeFoodMacros, computeMealMacros, roundMacro, formatTime } from '@/lib/utils'
import type {
  Food,
  FoodAlternative,
  Ingredient,
  Meal,
  MealPlan,
  MealType,
  DayOfWeek,
} from '@/lib/types'

// Local meal type: server `Meal` + a stable client-side key for drag-and-drop
// + ordered identity across renders. _dndKey isn't persisted — it just gives
// every row a sortable identity even before it has a database id.
type DraftMeal = Meal & { _dndKey: string }
const newMealKey = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`

// Stable display order for a meal list:
//   - meals with `time` set come first, sorted chronologically
//   - meals without a time follow, in their existing order_index order
// Reapplied after every state change so a coach can rely on "if I set a time,
// it lands at the right spot" without manually shuffling.
const sortMealsByTime = (meals: DraftMeal[]): DraftMeal[] => {
  const timed = meals.filter(m => m.time)
  const untimed = meals.filter(m => !m.time)
  timed.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  untimed.sort((a, b) => a.order_index - b.order_index)
  const combined = [...timed, ...untimed]
  combined.forEach((m, i) => {
    m.order_index = i
  })
  return combined
}

function SortableMealShell({
  id,
  children,
}: {
  id: string
  children: (drag: DragHandleProps) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {children({ attributes, listeners, isDragging })}
    </div>
  )
}

interface MealPlanBuilderProps {
  coachId: string
  mealPlan: MealPlan | null
  onClose: () => void
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

interface IngredientRowProps {
  ingredient: Ingredient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (field: keyof Ingredient, value: any) => void
  onRemove: () => void
}

function IngredientRow({ ingredient, onChange, onRemove }: IngredientRowProps) {
  return (
    <div className="grid grid-cols-12 gap-1.5 items-center bg-white rounded-md p-1.5 border border-slate-200">
      <div className="col-span-12 md:col-span-4">
        <Input
          value={ingredient.name}
          onChange={e => onChange('name', e.target.value)}
          placeholder="Ingredient"
          className="text-xs py-1.5"
        />
      </div>
      <div className="col-span-6 md:col-span-2">
        <Input
          value={ingredient.quantity}
          onChange={e => onChange('quantity', e.target.value)}
          placeholder="Qty"
          className="text-xs py-1.5"
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <Input
          type="number"
          step="any"
          min="0"
          value={ingredient.calories ?? ''}
          onChange={e => onChange('calories', e.target.value ? parseFloat(e.target.value) : null)}
          placeholder="Cal"
          className="text-xs py-1.5"
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <Input
          type="number"
          step="any"
          min="0"
          value={ingredient.protein_grams ?? ''}
          onChange={e => onChange('protein_grams', e.target.value ? parseFloat(e.target.value) : null)}
          placeholder="P"
          className="text-xs py-1.5"
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <Input
          type="number"
          step="any"
          min="0"
          value={ingredient.carbs_grams ?? ''}
          onChange={e => onChange('carbs_grams', e.target.value ? parseFloat(e.target.value) : null)}
          placeholder="C"
          className="text-xs py-1.5"
        />
      </div>
      <div className="col-span-3 md:col-span-1">
        <Input
          type="number"
          step="any"
          min="0"
          value={ingredient.fat_grams ?? ''}
          onChange={e => onChange('fat_grams', e.target.value ? parseFloat(e.target.value) : null)}
          placeholder="F"
          className="text-xs py-1.5"
        />
      </div>
      <div className="col-span-3 md:col-span-2 flex justify-end">
        <IconButton tone="danger" onClick={onRemove} aria-label="Remove ingredient">
          <X size={12} />
        </IconButton>
      </div>
    </div>
  )
}

const emptyFood = (orderIndex: number): Food => ({
  name: '',
  quantity: '',
  calories: null,
  protein_grams: null,
  carbs_grams: null,
  fat_grams: null,
  order_index: orderIndex,
  ingredients: [],
})

const emptyIngredient = (orderIndex: number): Ingredient => ({
  name: '',
  quantity: '',
  calories: null,
  protein_grams: null,
  carbs_grams: null,
  fat_grams: null,
  order_index: orderIndex,
})

const emptyFoodAlternative = (orderIndex: number): FoodAlternative => ({
  name: '',
  quantity: '',
  calories: null,
  protein_grams: null,
  carbs_grams: null,
  fat_grams: null,
  order_index: orderIndex,
})

function MacroSummary({
  macros,
  className = '',
}: {
  macros: { calories: number; protein_grams: number; carbs_grams: number; fat_grams: number }
  className?: string
}) {
  return (
    <div className={`flex items-center gap-3 text-xs text-slate-600 ${className}`}>
      <span>
        <span className="text-slate-400">Cal:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.calories)}</span>
      </span>
      <span>
        <span className="text-slate-400">P:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.protein_grams)}g</span>
      </span>
      <span>
        <span className="text-slate-400">C:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.carbs_grams)}g</span>
      </span>
      <span>
        <span className="text-slate-400">F:</span>{' '}
        <span className="font-semibold">{roundMacro(macros.fat_grams)}g</span>
      </span>
    </div>
  )
}

export default function MealPlanBuilder({ coachId, mealPlan, onClose }: MealPlanBuilderProps) {
  const supabase = useSupabase()
  const [name, setName] = useState(mealPlan?.name || '')
  const [description, setDescription] = useState(mealPlan?.description || '')
  const [isTemplate, setIsTemplate] = useState(mealPlan?.is_template || false)
  const [meals, setMeals] = useState<DraftMeal[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [expandedMeals, setExpandedMeals] = useState<Set<number>>(new Set())
  const [snapshotReady, setSnapshotReady] = useState(!mealPlan?.id)

  const isDirty = useDirtyState(
    { name, description, isTemplate, meals },
    snapshotReady
  )
  const [expandedFoods, setExpandedFoods] = useState<Set<string>>(new Set())

  const foodKey = (mealIndex: number, foodIndex: number) => `${mealIndex}-${foodIndex}`

  const toggleMealExpanded = (index: number) => {
    setExpandedMeals(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const toggleFoodExpanded = (mealIndex: number, foodIndex: number) => {
    setExpandedFoods(prev => {
      const next = new Set(prev)
      const key = foodKey(mealIndex, foodIndex)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    if (mealPlan?.id) fetchMeals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchMeals = async () => {
    if (!mealPlan?.id) return
    try {
      const { data: mealRows, error } = await supabase
        .from('meals')
        .select(
          '*, foods ( *, ingredients (*), food_alternatives ( id, name, quantity, calories, protein_grams, carbs_grams, fat_grams, order_index ) )'
        )
        .eq('meal_plan_id', mealPlan.id)
        .order('order_index')

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalized: DraftMeal[] = (mealRows || []).map((m: any) => ({
        ...m,
        days_of_week: (m.days_of_week ?? []) as DayOfWeek[],
        // Normalize "HH:MM:SS" → "HH:MM" so it works in <input type="time">.
        time: m.time ? String(m.time).slice(0, 5) : null,
        foods: (m.foods || [])
          .slice()
          .sort((a: Food, b: Food) => a.order_index - b.order_index)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((f: any) => ({
            ...f,
            ingredients: (f.ingredients || [])
              .slice()
              .sort((a: Ingredient, b: Ingredient) => a.order_index - b.order_index),
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
      setMeals(sortMealsByTime(normalized))
    } catch {
    } finally {
      setSnapshotReady(true)
    }
  }

  const addMeal = () => {
    const newMeal: DraftMeal = {
      meal_type: 'breakfast',
      name: '',
      description: '',
      days_of_week: [],
      time: null,
      calories: null,
      protein_grams: null,
      carbs_grams: null,
      fat_grams: null,
      order_index: meals.length,
      foods: [],
      _dndKey: newMealKey(),
    }
    const next = sortMealsByTime([...meals, newMeal])
    setMeals(next)
    // Auto-expand the freshly added meal so the coach can fill it in.
    const newPos = next.findIndex(m => m._dndKey === newMeal._dndKey)
    setExpandedMeals(prev => new Set(prev).add(newPos))
  }

  // Duplicate an existing meal — including all foods + ingredients — into a
  // new untouched copy. Strips server ids so the save flow treats it as new.
  const duplicateMeal = (index: number) => {
    const src = meals[index]
    if (!src) return
    const clone: DraftMeal = {
      ...src,
      id: undefined,
      _dndKey: newMealKey(),
      name: src.name ? `${src.name} (copy)` : '',
      foods: (src.foods ?? []).map(f => ({
        ...f,
        id: undefined,
        meal_id: undefined,
        ingredients: (f.ingredients ?? []).map(ing => ({
          ...ing,
          id: undefined,
          food_id: undefined,
        })),
      })),
    }
    // Drop right after the source for visual continuity. sortMealsByTime then
    // pulls timed meals to their chronological positions.
    const inserted = [...meals]
    inserted.splice(index + 1, 0, clone)
    inserted.forEach((m, i) => (m.order_index = i))
    const sorted = sortMealsByTime(inserted)
    setMeals(sorted)
    const newPos = sorted.findIndex(m => m._dndKey === clone._dndKey)
    setExpandedMeals(prev => new Set(prev).add(newPos))
    showToast('Meal duplicated')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateMeal = (index: number, field: keyof Meal, value: any) => {
    const updated = [...meals]
    updated[index] = { ...updated[index], [field]: value }
    // Re-sort whenever a time changes; timed meals must always sit at their
    // chronological position relative to other timed meals.
    setMeals(field === 'time' ? sortMealsByTime(updated) : updated)
  }

  const removeMeal = (index: number) => {
    const updated = meals.filter((_, i) => i !== index)
    updated.forEach((m, i) => (m.order_index = i))
    setMeals(updated)
  }

  // dnd-kit sensors with a small distance threshold so taps inside a meal
  // card pass through to inputs/buttons.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = meals.findIndex(m => m._dndKey === active.id)
    const newIndex = meals.findIndex(m => m._dndKey === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(meals, oldIndex, newIndex)
    next.forEach((m, i) => (m.order_index = i))
    // Re-apply the time sort: dragging a timed meal snaps back into its
    // chronological position; dragging an untimed meal lands where the user
    // dropped it (within the untimed tail).
    setMeals(sortMealsByTime(next))
  }

  const addFood = (mealIndex: number) => {
    const updated = [...meals]
    const foods = updated[mealIndex].foods || []
    updated[mealIndex] = { ...updated[mealIndex], foods: [...foods, emptyFood(foods.length)] }
    setMeals(updated)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateFood = (mealIndex: number, foodIndex: number, field: keyof Food, value: any) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    foods[foodIndex] = { ...foods[foodIndex], [field]: value }
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
  }

  const removeFood = (mealIndex: number, foodIndex: number) => {
    const updated = [...meals]
    const foods = (updated[mealIndex].foods || []).filter((_, i) => i !== foodIndex)
    foods.forEach((f, i) => (f.order_index = i))
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
  }

  const addIngredient = (mealIndex: number, foodIndex: number) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    const ingredients = foods[foodIndex].ingredients || []
    foods[foodIndex] = {
      ...foods[foodIndex],
      ingredients: [...ingredients, emptyIngredient(ingredients.length)],
    }
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
    // Auto-expand the food when an ingredient is added so the new row is visible.
    setExpandedFoods(prev => new Set(prev).add(foodKey(mealIndex, foodIndex)))
  }

  const updateIngredient = (
    mealIndex: number,
    foodIndex: number,
    ingredientIndex: number,
    field: keyof Ingredient,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    const ingredients = [...(foods[foodIndex].ingredients || [])]
    ingredients[ingredientIndex] = { ...ingredients[ingredientIndex], [field]: value }
    foods[foodIndex] = { ...foods[foodIndex], ingredients }
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
  }

  const removeIngredient = (mealIndex: number, foodIndex: number, ingredientIndex: number) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    const ingredients = (foods[foodIndex].ingredients || []).filter(
      (_, i) => i !== ingredientIndex
    )
    ingredients.forEach((ing, i) => (ing.order_index = i))
    foods[foodIndex] = { ...foods[foodIndex], ingredients }
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
  }

  // Food alternatives — coach-defined fallbacks ("Greek yogurt" instead of
  // "Eggs"). Each alternative carries its own quantity + macros since a
  // calorie-equivalent portion of a different food can have very different
  // weights and macros.
  const addFoodAlternative = (mealIndex: number, foodIndex: number) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    const current = foods[foodIndex].alternatives ?? []
    foods[foodIndex] = {
      ...foods[foodIndex],
      alternatives: [...current, emptyFoodAlternative(current.length)],
    }
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
  }

  const updateFoodAlternative = (
    mealIndex: number,
    foodIndex: number,
    altIndex: number,
    field: keyof FoodAlternative,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    const current = [...(foods[foodIndex].alternatives ?? [])]
    current[altIndex] = { ...current[altIndex], [field]: value }
    foods[foodIndex] = { ...foods[foodIndex], alternatives: current }
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
  }

  const removeFoodAlternative = (mealIndex: number, foodIndex: number, altIndex: number) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    const current = (foods[foodIndex].alternatives ?? [])
      .filter((_, i) => i !== altIndex)
      .map((alt, i) => ({ ...alt, order_index: i }))
    foods[foodIndex] = { ...foods[foodIndex], alternatives: current }
    updated[mealIndex] = { ...updated[mealIndex], foods }
    setMeals(updated)
  }

  const requestClose = () => {
    if (isDirty && !saving) setConfirmDiscard(true)
    else onClose()
  }

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Please enter a meal plan name', 'error')
      return
    }

    setSaving(true)
    try {
      let planId = mealPlan?.id

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

      // ── Diff-based meal sync ────────────────────────────────────────────
      // Preserve `meal_id` for unchanged meals so child `meal_logs` (which
      // reference meal_id with ON DELETE CASCADE) survive the edit. Only
      // meals the coach explicitly removed get their logs cascaded away.
      const mealFields = (m: DraftMeal, formIndex: number) => ({
        meal_type: m.meal_type,
        name: m.name,
        description: m.description,
        days_of_week: m.days_of_week,
        time: m.time || null,
        // Macros are derived from foods/ingredients; never store stale values.
        calories: null,
        protein_grams: null,
        carbs_grams: null,
        fat_grams: null,
        order_index: formIndex,
      })

      // 1) Read what's currently on the server.
      const serverMealIds = new Set<string>()
      if (mealPlan?.id) {
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

      // 2) Delete meals the coach removed. CASCADE removes their meal_logs —
      // intentional, since the meal itself is gone.
      const mealsToDelete = Array.from(serverMealIds).filter(id => !formMealIds.has(id))
      if (mealsToDelete.length > 0) {
        const { error } = await supabase.from('meals').delete().in('id', mealsToDelete)
        if (error) throw error
      }

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

      // 5) Replace foods + ingredients per surviving meal. Nothing in the DB
      // references food_id or ingredient_id from outside this meal plan, so
      // delete-and-reinsert here is safe.
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
        ;(m.foods || []).forEach((f, foodIndex) => {
          if (!f.name.trim()) return
          // If a food has ingredients, its own macro fields are derived → store null.
          const hasIngredients = (f.ingredients || []).some(ing => ing.name.trim())
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
        insertedFoods = data || []
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ingredientsToInsert: any[] = []
      foodLocalRefs.forEach((ref, i) => {
        const insertedFood = insertedFoods[i]
        if (!insertedFood) return
        const food = meals[ref.mealIndex].foods?.[ref.foodIndex]
        ;(food?.ingredients || []).forEach(ing => {
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

      // Food alternatives: parallel structure to ingredients. Old rows were
      // wiped via the foods cascade-delete above, so this is pure insert.
      // Each alternative carries its own quantity + macros so portion sizes
      // (218 cal of rice ≠ 218 cal of potato) round-trip correctly.
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

      onClose()
    } catch {
      showToast('Failed to save meal plan', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <IconButton onClick={requestClose} aria-label="Go back">
          <ArrowLeft size={18} />
        </IconButton>
        <h2 className="text-xl font-bold text-slate-900">
          {mealPlan ? 'Edit Meal Plan' : 'Create Meal Plan'}
        </h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 space-y-4">
        <Field id="mp-name" label="Meal Plan Name">
          <Input
            id="mp-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., High Protein Cut"
          />
        </Field>

        <Field id="mp-desc" label="Description" optional>
          <Textarea
            id="mp-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Brief description of this meal plan..."
            rows={2}
          />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={e => setIsTemplate(e.target.checked)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
          />
          <span className="text-sm text-slate-700">Save as template</span>
        </label>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Meals</h3>
        <Button variant="success" size="sm" onClick={addMeal}>
          <Plus size={14} />
          Add Meal
        </Button>
      </div>

      {meals.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-8 text-center">
          <p className="text-slate-400 text-sm">No meals yet. Add your first meal above.</p>
        </div>
      ) : (
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext
            items={meals.map(m => m._dndKey)}
            strategy={verticalListSortingStrategy}
          >
        <div className="space-y-3">
          {meals.map((meal, index) => {
            const mealMacros = computeMealMacros(meal)
            const isExpanded = expandedMeals.has(index)
            return (
            <SortableMealShell key={meal._dndKey} id={meal._dndKey}>
              {drag => (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                {/* Collapsible header — click anywhere except the action buttons to toggle */}
                <div className="flex justify-between items-center gap-2">
                  <DragHandle {...drag} />
                  <button
                    type="button"
                    onClick={() => toggleMealExpanded(index)}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer group"
                    aria-expanded={isExpanded}
                  >
                    <span className="text-slate-400 group-hover:text-slate-700 transition-transform">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">
                      Meal {index + 1}
                    </span>
                    {meal.name && (
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {meal.name}
                      </span>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 shrink-0">
                      {meal.meal_type}
                    </span>
                    {meal.time && (
                      <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                        {formatTime(meal.time)}
                      </span>
                    )}
                    {!isExpanded && (
                      <span className="text-xs text-slate-400 shrink-0 ml-auto pr-2 hidden sm:inline">
                        {Math.round(mealMacros.calories)} cal
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <IconButton
                      onClick={() => duplicateMeal(index)}
                      aria-label="Duplicate meal"
                      title="Duplicate this meal"
                    >
                      <Copy size={14} />
                    </IconButton>
                    <IconButton tone="danger" onClick={() => removeMeal(index)} aria-label="Remove meal">
                      <X size={16} />
                    </IconButton>
                  </div>
                </div>

                {!isExpanded && (
                  <div className="mt-3 pl-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
                    {meal.days_of_week.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {meal.days_of_week
                          .slice()
                          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                          .map(d => (
                            <span
                              key={d}
                              className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-[10px] font-semibold uppercase tracking-wide leading-none"
                            >
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Any day</span>
                    )}
                    <span className="text-slate-300">&middot;</span>
                    <span>
                      {(meal.foods?.length ?? 0)}{' '}
                      {(meal.foods?.length ?? 0) === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-4">
                    <div className="mb-3">
                      <label className="block text-xs text-slate-500 mb-2">Days</label>
                      <DayOfWeekSelector
                        value={meal.days_of_week}
                        onChange={days => updateMeal(index, 'days_of_week', days)}
                      />
                    </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Type</label>
                    <Select
                      value={meal.meal_type}
                      onChange={e => updateMeal(index, 'meal_type', e.target.value as MealType)}
                      className="capitalize"
                    >
                      {MEAL_TYPES.map(t => (
                        <option key={t} value={t} className="capitalize">
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">
                      Time <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <Input
                      type="time"
                      value={meal.time ?? ''}
                      onChange={e => updateMeal(index, 'time', e.target.value || null)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">Name</label>
                    <Input
                      value={meal.name}
                      onChange={e => updateMeal(index, 'name', e.target.value)}
                      placeholder="e.g., Greek Yogurt with Berries"
                    />
                  </div>
                  <div className="md:col-span-6">
                    <label className="block text-xs text-slate-500 mb-1">Description</label>
                    <Input
                      value={meal.description}
                      onChange={e => updateMeal(index, 'description', e.target.value)}
                      placeholder="Prep notes, instructions, etc."
                    />
                  </div>
                </div>

                {/* Computed meal totals */}
                <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Meal totals
                  </span>
                  <MacroSummary macros={mealMacros} />
                </div>

                {/* Items (foods) sub-section */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Items
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => addFood(index)}>
                      <Plus size={12} />
                      Add Item
                    </Button>
                  </div>

                  {(meal.foods?.length ?? 0) === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Add items to this meal. An item can be a single thing
                      (e.g. &ldquo;1 tbsp olive oil&rdquo;) or a recipe broken into ingredients.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {meal.foods!.map((food, foodIndex) => {
                        const hasIngredients = (food.ingredients?.length ?? 0) > 0
                        const foodMacros = computeFoodMacros(food)
                        return (
                          <div key={foodIndex} className="bg-slate-50 rounded-lg p-3">
                            {/* Row 1: chevron (recipes only) + name + qty (basic items only) + remove */}
                            <div className="flex items-start gap-2">
                              {hasIngredients && (
                                <button
                                  type="button"
                                  onClick={() => toggleFoodExpanded(index, foodIndex)}
                                  aria-label={
                                    expandedFoods.has(foodKey(index, foodIndex))
                                      ? 'Collapse item'
                                      : 'Expand item'
                                  }
                                  aria-expanded={expandedFoods.has(foodKey(index, foodIndex))}
                                  className="mt-2 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                                >
                                  {expandedFoods.has(foodKey(index, foodIndex)) ? (
                                    <ChevronDown size={16} />
                                  ) : (
                                    <ChevronRight size={16} />
                                  )}
                                </button>
                              )}
                              <div className="flex-1 min-w-0">
                                <Input
                                  value={food.name}
                                  onChange={e => updateFood(index, foodIndex, 'name', e.target.value)}
                                  placeholder={hasIngredients ? 'Recipe name' : 'Item name'}
                                  className="text-sm"
                                />
                              </div>
                              {!hasIngredients && (
                                <div className="w-32 shrink-0">
                                  <Input
                                    value={food.quantity}
                                    onChange={e =>
                                      updateFood(index, foodIndex, 'quantity', e.target.value)
                                    }
                                    placeholder="Qty"
                                    className="text-sm"
                                  />
                                </div>
                              )}
                              <IconButton
                                tone="danger"
                                onClick={() => removeFood(index, foodIndex)}
                                aria-label="Remove item"
                              >
                                <X size={14} />
                              </IconButton>
                            </div>

                            {/* Row 2: macros (4 equal columns) — only when no ingredients */}
                            {!hasIngredients && (
                              <div className="grid grid-cols-4 gap-2 mt-2">
                                {(
                                  [
                                    { field: 'calories' as const, label: 'Cal' },
                                    { field: 'protein_grams' as const, label: 'P (g)' },
                                    { field: 'carbs_grams' as const, label: 'C (g)' },
                                    { field: 'fat_grams' as const, label: 'F (g)' },
                                  ]
                                ).map(({ field, label }) => (
                                  <div key={field}>
                                    <label className="block text-[10px] text-slate-500 mb-1">{label}</label>
                                    <Input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={food[field] ?? ''}
                                      onChange={e =>
                                        updateFood(
                                          index,
                                          foodIndex,
                                          field,
                                          e.target.value ? parseFloat(e.target.value) : null
                                        )
                                      }
                                      className="text-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Recipe-style items: collapsed summary OR full breakdown */}
                            {hasIngredients && !expandedFoods.has(foodKey(index, foodIndex)) && (
                              <div className="mt-2 ml-6 flex items-center gap-3 text-xs text-slate-500">
                                <span>
                                  {food.ingredients!.length}{' '}
                                  {food.ingredients!.length === 1 ? 'ingredient' : 'ingredients'}
                                </span>
                                <span className="text-slate-300">&middot;</span>
                                <MacroSummary macros={foodMacros} className="text-[11px]" />
                              </div>
                            )}

                            {hasIngredients && expandedFoods.has(foodKey(index, foodIndex)) && (
                              <>
                                <div className="mt-2 bg-white border border-slate-200 rounded-md px-2 py-1.5 flex items-center justify-between flex-wrap gap-2">
                                  <span className="text-[10px] text-slate-400 italic">
                                    Auto-calculated from ingredients
                                  </span>
                                  <MacroSummary macros={foodMacros} />
                                </div>

                                <div className="mt-2 ml-4 pl-3 border-l-2 border-slate-200">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                      Ingredients
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => addIngredient(index, foodIndex)}
                                      className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                    >
                                      + Add Ingredient
                                    </button>
                                  </div>

                                  <div className="space-y-1">
                                    {food.ingredients!.map((ing, ingIndex) => (
                                      <IngredientRow
                                      key={ingIndex}
                                      ingredient={ing}
                                      onChange={(field, value) =>
                                        updateIngredient(index, foodIndex, ingIndex, field, value)
                                      }
                                      onRemove={() => removeIngredient(index, foodIndex, ingIndex)}
                                    />
                                  ))}
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Coach-defined alternatives. Display-only on the
                                trainee side ("If no eggs, try Greek yogurt"). */}
                            <div className="mt-2 ml-4 pl-3 border-l-2 border-slate-200">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                                  Alternatives
                                </span>
                                <button
                                  type="button"
                                  onClick={() => addFoodAlternative(index, foodIndex)}
                                  className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                >
                                  + Add Alternative
                                </button>
                              </div>
                              {(food.alternatives ?? []).length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic px-1 py-0.5">
                                  None yet. Add &ldquo;Greek yogurt&rdquo; or &ldquo;Cottage
                                  cheese&rdquo; so clients can swap if they don&rsquo;t have
                                  the original on hand.
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {/* Reuse IngredientRow — FoodAlternative
                                      shares its field shape (name + qty + macros). */}
                                  {(food.alternatives ?? []).map((alt, altIdx) => (
                                    <IngredientRow
                                      key={altIdx}
                                      ingredient={alt}
                                      onChange={(field, value) =>
                                        updateFoodAlternative(
                                          index,
                                          foodIndex,
                                          altIdx,
                                          field as keyof FoodAlternative,
                                          value
                                        )
                                      }
                                      onRemove={() =>
                                        removeFoodAlternative(index, foodIndex, altIdx)
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                  </div>
                )}
              </div>
              )}
            </SortableMealShell>
            )
          })}
        </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Bottom "Add meal" — saves a long scroll back to the top after
          appending a card. Hidden in the empty state since the dashed empty
          card already prompts the action. */}
      {meals.length > 0 && (
        <button
          type="button"
          onClick={addMeal}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/40 transition-colors cursor-pointer text-sm font-medium"
        >
          <Plus size={16} />
          Add Meal
        </button>
      )}

      <div className="h-24" aria-hidden />

      <div className="sticky bottom-0 -mx-4 sm:-mx-8 mt-6 z-20 px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-6px_20px_-8px_rgba(15,23,42,0.12)] flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span className="tabular-nums">
            <span className="font-semibold text-slate-700">{meals.length}</span>{' '}
            {meals.length === 1 ? 'meal' : 'meals'}
          </span>
          <UnsavedBadge visible={isDirty && !saving} />
        </div>
        <div className="sm:hidden">
          <UnsavedBadge visible={isDirty && !saving} />
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={requestClose} disabled={saving} size="sm">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty}
          size="sm"
        >
          {!saving && <Save size={14} />}
          {saving ? 'Saving…' : 'Save Meal Plan'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved edits to this meal plan. They'll be lost if you leave now."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
