'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { useAssignmentSync } from '@/lib/hooks/use-assignment-sync'
import {
  useIngredientCatalog,
  type IngredientCatalogEntry,
} from '@/lib/hooks/use-ingredient-catalog'
import { MealCard, type MealCardActions } from './MealCard'
import { loadMealPlanMeals, saveMealPlan } from './persistence'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { BuilderHeader } from '@/components/ui/BuilderHeader'
import { BuilderSaveBar } from '@/components/ui/BuilderSaveBar'
import { BuilderCard } from '@/components/ui/BuilderCard'
import { EmptyStateCard } from '@/components/ui/EmptyStateCard'
import { DiscardDialog } from '@/components/ui/DiscardDialog'
import { AddItemButton } from '@/components/ui/AddItemButton'
import { AddFab } from '@/components/ui/AddFab'
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
import { type DragHandleProps } from '@/components/ui/SortableList'
import { useDirtyState } from '@/lib/use-dirty-state'
import { Plus } from 'lucide-react'
import { computeMealMacros, roundMacro, formatTime } from '@/lib/utils'
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

export default function MealPlanBuilder({ coachId, mealPlan, onClose }: MealPlanBuilderProps) {
  const supabase = useSupabase()
  const { invalidateMealPlans } = useAssignmentSync()
  // Powers the type-ahead suggestions in each IngredientRow's name
  // field. One fetch per builder mount (TanStack dedupes across rows).
  const ingredientCatalog = useIngredientCatalog(coachId)
  const [name, setName] = useState(mealPlan?.name || '')
  const [description, setDescription] = useState(mealPlan?.description || '')
  const [isTemplate, setIsTemplate] = useState(mealPlan?.is_template || false)
  const [meals, setMeals] = useState<DraftMeal[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [expandedMeals, setExpandedMeals] = useState<Set<number>>(new Set())
  // _dndKey → slot key captured at expand-time. While a meal is expanded,
  // its rendered slot stays the same as when expansion began so editing the
  // time field doesn't make the card jump out from under the user. Cleared
  // on collapse / removal / fresh load.
  const [pinnedSlotKey, setPinnedSlotKey] = useState<Map<string, string>>(new Map())
  const [snapshotReady, setSnapshotReady] = useState(!mealPlan?.id)

  const isDirty = useDirtyState(
    { name, description, isTemplate, meals },
    snapshotReady
  )
  const [expandedFoods, setExpandedFoods] = useState<Set<string>>(new Set())

  // Per-day macro rollup. A meal with no `days_of_week` set is treated as
  // "every day". For each weekday we sum the applicable meals; if every day
  // matches we show a single number, otherwise we surface min–max so the
  // coach sees the lightest/heaviest day at a glance.
  const dailyTotals = useMemo(() => {
    const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]
    const perDay = days.map(d => {
      const applicable = meals.filter(m => {
        const dow = m.days_of_week ?? []
        return dow.length === 0 || dow.includes(d)
      })
      return applicable.reduce(
        (acc, m) => {
          const macros = computeMealMacros(m)
          return {
            calories: acc.calories + macros.calories,
            protein_grams: acc.protein_grams + macros.protein_grams,
            carbs_grams: acc.carbs_grams + macros.carbs_grams,
            fat_grams: acc.fat_grams + macros.fat_grams,
          }
        },
        { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 }
      )
    })
    const cals = perDay.map(t => t.calories)
    const minCals = Math.min(...cals)
    const maxCals = Math.max(...cals)
    // "Same every day" if the kcal spread is under 1 — protein/carbs/fat
    // will follow when kcal does, so we don't need a multi-axis check.
    const uniform = maxCals - minCals < 1
    // Pick the heaviest day's macros for the displayed P/C/F.
    const heaviest = perDay.reduce(
      (best, t) => (t.calories > best.calories ? t : best),
      perDay[0]
    )
    return { uniform, minCals, maxCals, heaviest }
  }, [meals])

  const foodKey = (mealIndex: number, foodIndex: number) => `${mealIndex}-${foodIndex}`

  const slotKeyOf = (m: DraftMeal): string =>
    `${m.meal_type}::${m.time ?? '__notime'}`

  const toggleMealExpanded = (index: number) => {
    const meal = meals[index]
    setExpandedMeals(prev => {
      const next = new Set(prev)
      const wasExpanded = next.has(index)
      if (wasExpanded) next.delete(index)
      else next.add(index)
      // Pin on expand, drop on collapse — keyed by stable _dndKey so an
      // index shuffle (drag, sort) doesn't strand the pin on the wrong meal.
      if (meal) {
        setPinnedSlotKey(p => {
          const np = new Map(p)
          if (wasExpanded) np.delete(meal._dndKey)
          else np.set(meal._dndKey, slotKeyOf(meal))
          return np
        })
      }
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
      const meals = await loadMealPlanMeals(supabase, mealPlan.id)
      setMeals(meals)
      setPinnedSlotKey(new Map())
    } catch {
      // Empty meal list — coach can still add new ones.
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
    // Don't re-sort on time change while the user is actively editing —
    // jumping the row mid-edit is jarring. The slot view pins expanded
    // meals to their original slot until collapsed; on collapse the
    // grouping (and the flat sort, on save) picks up the new value.
    setMeals(updated)
  }

  const removeMeal = (index: number) => {
    const removed = meals[index]
    const updated = meals.filter((_, i) => i !== index)
    updated.forEach((m, i) => (m.order_index = i))
    setMeals(updated)
    if (removed?._dndKey) {
      setPinnedSlotKey(p => {
        if (!p.has(removed._dndKey)) return p
        const np = new Map(p)
        np.delete(removed._dndKey)
        return np
      })
    }
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

  /** Bulk-update name + qty + macros from an autocomplete pick. Single
   *  setState so the re-render isn't six per-field updates. */
  const replaceIngredient = (
    mealIndex: number,
    foodIndex: number,
    ingredientIndex: number,
    entry: IngredientCatalogEntry
  ) => {
    const updated = [...meals]
    const foods = [...(updated[mealIndex].foods || [])]
    const ingredients = [...(foods[foodIndex].ingredients || [])]
    ingredients[ingredientIndex] = {
      ...ingredients[ingredientIndex],
      name: entry.name,
      quantity: entry.quantity,
      calories: entry.calories,
      protein_grams: entry.protein_grams,
      carbs_grams: entry.carbs_grams,
      fat_grams: entry.fat_grams,
    }
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

  // Pass the parent's handlers straight through — MealCard fills in the
  // leading `index` arg from its own prop, so signatures match 1:1.
  const mealActions: MealCardActions = {
    toggleMealExpanded,
    toggleFoodExpanded,
    duplicateMeal,
    removeMeal,
    updateMeal,
    addFood,
    updateFood,
    removeFood,
    addIngredient,
    updateIngredient,
    replaceIngredient,
    removeIngredient,
    addFoodAlternative,
    updateFoodAlternative,
    removeFoodAlternative,
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
      await saveMealPlan(supabase, {
        coachId,
        existingPlanId: mealPlan?.id,
        name,
        description,
        isTemplate,
        meals,
      })
      // Push the edit out to every trainee viewing this plan. The
      // trainee's `useMealPlanAssignments` query embeds the full meal
      // plan payload, so name / meal / food changes only show up on
      // the trainee side after that cache is invalidated.
      await invalidateMealPlans({ coachId })
      onClose()
    } catch {
      showToast('Failed to save meal plan', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Group meals by `(meal_type, time)` slot so similar entries (e.g., the
  // Mon–Thu version of breakfast and the Fri-only version) cluster under one
  // header instead of getting "Meal 8 / Meal 9" treatment in a flat list.
  // Slots are ordered: timed first chronologically, then untimed by meal_type.
  const MEAL_TYPE_ORDER: Record<MealType, number> = {
    breakfast: 0,
    lunch: 1,
    dinner: 2,
    snack: 3,
  }
  type MealSlot = {
    key: string
    meal_type: MealType
    time: string | null
    meals: DraftMeal[]
  }
  // Decode a slot key back into its meal_type + time so a pinned key can
  // produce a synthetic slot when the meal's actual time has drifted away
  // from where it was at expand-time.
  const decodeSlotKey = (
    key: string
  ): { meal_type: MealType; time: string | null } => {
    const sep = key.indexOf('::')
    const mt = (sep > 0 ? key.slice(0, sep) : key) as MealType
    const t = sep > 0 ? key.slice(sep + 2) : '__notime'
    return { meal_type: mt, time: t === '__notime' ? null : t }
  }

  const mealSlots: MealSlot[] = useMemo(() => {
    const map = new Map<string, MealSlot>()
    for (const m of meals) {
      // Pinned slot wins while the meal is being edited, so it doesn't jump
      // out from under the user when they change the time field.
      const naturalKey = slotKeyOf(m)
      const useKey = pinnedSlotKey.get(m._dndKey) ?? naturalKey
      let existing = map.get(useKey)
      if (!existing) {
        const decoded = decodeSlotKey(useKey)
        existing = {
          key: useKey,
          meal_type: decoded.meal_type,
          time: decoded.time,
          meals: [],
        }
        map.set(useKey, existing)
      }
      existing.meals.push(m)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return MEAL_TYPE_ORDER[a.meal_type] - MEAL_TYPE_ORDER[b.meal_type]
    })
    // slotKeyOf / decodeSlotKey are stable in-render helpers; meals +
    // pinnedSlotKey are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, pinnedSlotKey])

  return (
    <div>
      <BuilderHeader
        title={mealPlan ? 'Edit Meal Plan' : 'Create Meal Plan'}
        onBack={requestClose}
      />

      <BuilderCard>
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
            className="h-4 w-4 text-indigo-fg focus:ring-indigo-500 border-line rounded cursor-pointer"
          />
          <span className="text-sm text-foreground">Save as template</span>
        </label>
      </BuilderCard>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">Meals</h3>
        <Button variant="success" size="sm" onClick={addMeal}>
          <Plus size={14} />
          Add Meal
        </Button>
      </div>

      {/* Sticky daily-totals strip. On mobile it pins below the 3.5rem app
          bar so the running total stays visible while scrolling through long
          meal lists — coaches almost always plan against a calorie/protein
          target, and the previous design made you scroll back up to check. */}
      {meals.length > 0 && (
        <div className="sticky top-14 md:top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 mb-3 bg-canvas/95 backdrop-blur-sm">
          <div className="bg-surface border border-line rounded-xl px-3 py-2 shadow-sm">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-subtle">
                  {dailyTotals.uniform ? 'Daily' : 'Daily range'}
                </span>
                <span className="text-base font-bold text-foreground tabular-nums">
                  {dailyTotals.uniform
                    ? Math.round(dailyTotals.maxCals)
                    : `${Math.round(dailyTotals.minCals)}–${Math.round(dailyTotals.maxCals)}`}
                </span>
                <span className="text-[11px] text-subtle font-medium">cal</span>
              </div>
              <div className="flex items-baseline gap-2.5 text-[11px] tabular-nums">
                <span className="text-muted">
                  P{' '}
                  <span className="font-semibold text-foreground">
                    {roundMacro(dailyTotals.heaviest.protein_grams)}
                  </span>
                </span>
                <span className="text-muted">
                  C{' '}
                  <span className="font-semibold text-foreground">
                    {roundMacro(dailyTotals.heaviest.carbs_grams)}
                  </span>
                </span>
                <span className="text-muted">
                  F{' '}
                  <span className="font-semibold text-foreground">
                    {roundMacro(dailyTotals.heaviest.fat_grams)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {meals.length === 0 ? (
        <EmptyStateCard message="No meals yet. Add your first meal above." />
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
        <div className="space-y-6">
          {mealSlots.map(slot => (
            <div key={slot.key}>
              {/* Slot header — `Breakfast · 8:00 AM`. Identical-time variants
                  cluster here so Mon-Thu and Fri versions of the same meal are
                  visibly siblings, not sequential "Meal 8 / Meal 9". */}
              <div className="flex items-baseline gap-2 mb-2 px-1 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-fg">
                  {slot.meal_type}
                </span>
                {slot.time ? (
                  <span className="text-xs font-semibold text-foreground tabular-nums">
                    {formatTime(slot.time)}
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-widest text-subtle">
                    No time set
                  </span>
                )}
                <span className="text-[10px] text-subtle ml-auto tabular-nums">
                  {slot.meals.length}{' '}
                  {slot.meals.length === 1 ? 'option' : 'options'}
                </span>
              </div>
              <div className="space-y-3">
                {slot.meals.map(meal => {
                  const index = meals.indexOf(meal)
                  const isExpanded = expandedMeals.has(index)
                  // Compute drift hint here so MealCard stays slot-agnostic —
                  // it only needs the rendered string (or null) to decide
                  // whether to show the amber pill.
                  const pinned = pinnedSlotKey.get(meal._dndKey)
                  const naturalKey = slotKeyOf(meal)
                  let driftHint: string | null = null
                  if (pinned && pinned !== naturalKey) {
                    const { meal_type, time } = decodeSlotKey(naturalKey)
                    driftHint = time
                      ? `${meal_type} · ${formatTime(time)}`
                      : `${meal_type} (no time)`
                  }
                  return (
                    <SortableMealShell key={meal._dndKey} id={meal._dndKey}>
                      {drag => (
                        <MealCard
                          meal={meal}
                          index={index}
                          isExpanded={isExpanded}
                          isFoodExpanded={fi =>
                            expandedFoods.has(foodKey(index, fi))
                          }
                          driftHint={driftHint}
                          catalog={ingredientCatalog.data ?? []}
                          drag={drag}
                          actions={mealActions}
                        />
                      )}
                    </SortableMealShell>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
          </SortableContext>
        </DndContext>
      )}

      {meals.length > 0 && (
        <AddItemButton label="Add Meal" onClick={addMeal} />
      )}
      {meals.length > 0 && <AddFab ariaLabel="Add meal" onClick={addMeal} />}

      <BuilderSaveBar
        count={meals.length}
        noun="meal"
        isDirty={isDirty}
        saving={saving}
        onCancel={requestClose}
        onSave={handleSave}
        saveLabel="Save Meal Plan"
      />

      <DiscardDialog
        open={confirmDiscard}
        noun="meal plan"
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
