'use client'

import { ChevronDown, ChevronRight, Copy, Plus, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { DayOfWeekSelector } from '@/components/ui/DayOfWeekSelector'
import { DragHandle, type DragHandleProps } from '@/components/ui/SortableList'
import { computeFoodMacros, computeMealMacros } from '@/lib/utils'
import { IngredientRow } from './IngredientRow'
import { QuantityInput } from './QuantityInput'
import { MacroSummary } from './MacroInputs'
import type { IngredientCatalogEntry } from '@/lib/hooks/use-ingredient-catalog'
import type {
  Food,
  FoodAlternative,
  Ingredient,
  Meal,
  MealType,
} from '@/lib/types'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

// All handlers stay multi-arg so the parent can pass them as-is. The card
// only needs the meal's own `index` to fill in the leading arg.
export type MealCardActions = {
  toggleMealExpanded: (index: number) => void
  toggleFoodExpanded: (index: number, foodIndex: number) => void
  duplicateMeal: (index: number) => void
  removeMeal: (index: number) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateMeal: (index: number, field: keyof Meal, value: any) => void
  addFood: (index: number) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateFood: (index: number, foodIndex: number, field: keyof Food, value: any) => void
  removeFood: (index: number, foodIndex: number) => void
  addIngredient: (index: number, foodIndex: number) => void
  updateIngredient: (
    index: number,
    foodIndex: number,
    ingIndex: number,
    field: keyof Ingredient,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ) => void
  replaceIngredient: (
    index: number,
    foodIndex: number,
    ingIndex: number,
    entry: IngredientCatalogEntry
  ) => void
  removeIngredient: (index: number, foodIndex: number, ingIndex: number) => void
  addFoodAlternative: (index: number, foodIndex: number) => void
  updateFoodAlternative: (
    index: number,
    foodIndex: number,
    altIdx: number,
    field: keyof FoodAlternative,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ) => void
  removeFoodAlternative: (index: number, foodIndex: number, altIdx: number) => void
}

export function MealCard({
  meal,
  index,
  isExpanded,
  isFoodExpanded,
  driftHint,
  catalog,
  drag,
  actions,
}: {
  meal: Meal
  index: number
  isExpanded: boolean
  /** Per-food expansion check, already bound to this meal's index. */
  isFoodExpanded: (foodIndex: number) => boolean
  /** If the meal's current type+time no longer matches its pinned slot,
   *  the parent precomputes a label like "lunch · 12:30 PM" to surface
   *  the "will jump on collapse" hint. Null = no drift. */
  driftHint: string | null
  catalog: IngredientCatalogEntry[]
  drag: DragHandleProps
  actions: MealCardActions
}) {
  const mealMacros = computeMealMacros(meal)
  return (
    <div className="bg-surface rounded-xl border border-line p-4">
      <div className="flex justify-between items-center gap-2">
        <DragHandle {...drag} />
        <button
          type="button"
          onClick={() => actions.toggleMealExpanded(index)}
          className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer group"
          aria-expanded={isExpanded}
        >
          <span className="text-subtle group-hover:text-foreground transition-transform shrink-0">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          {meal.name ? (
            <span className="text-sm font-medium text-foreground truncate min-w-0">
              {meal.name}
            </span>
          ) : (
            <span className="text-sm text-subtle italic shrink-0 pr-0.5">
              Untitled meal
            </span>
          )}
          {!isExpanded && (
            <span className="text-xs text-subtle shrink-0 ml-auto pr-2 hidden sm:inline tabular-nums">
              {Math.round(mealMacros.calories)} cal
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <IconButton
            onClick={() => actions.duplicateMeal(index)}
            aria-label="Duplicate meal"
            title="Duplicate this meal"
          >
            <Copy size={14} />
          </IconButton>
          <IconButton
            tone="danger"
            onClick={() => actions.removeMeal(index)}
            aria-label="Remove meal"
          >
            <X size={16} />
          </IconButton>
        </div>
      </div>

      {!isExpanded && (
        <div className="mt-3 pl-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
          {meal.days_of_week.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {meal.days_of_week
                .slice()
                .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                .map(d => (
                  <span
                    key={d}
                    className="px-2.5 py-1 bg-indigo-soft text-indigo-fg border border-indigo-line rounded-full text-[10px] font-semibold uppercase tracking-wide leading-none"
                  >
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
                  </span>
                ))}
            </div>
          ) : (
            <span className="text-subtle italic">Any day</span>
          )}
          <span className="text-faint">&middot;</span>
          <span>
            {(meal.foods?.length ?? 0)}{' '}
            {(meal.foods?.length ?? 0) === 1 ? 'item' : 'items'}
          </span>
        </div>
      )}

      {isExpanded && (
        <div className="mt-4">
          {driftHint && (
            <div className="mb-3 text-[11px] text-amber-fg bg-amber-soft border border-amber-line rounded-md px-2.5 py-1.5 flex items-center gap-1.5">
              <span className="font-semibold uppercase tracking-widest text-[9px]">
                Will move
              </span>
              <span className="text-foreground">→ {driftHint}</span>
              <span className="ml-auto text-[10px] text-amber-fg">on close</span>
            </div>
          )}
          <div className="mb-3">
            <label className="block text-xs text-muted mb-2">Days</label>
            <DayOfWeekSelector
              value={meal.days_of_week}
              onChange={days => actions.updateMeal(index, 'days_of_week', days)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3">
            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">Type</label>
              <Select
                value={meal.meal_type}
                onChange={e =>
                  actions.updateMeal(index, 'meal_type', e.target.value as MealType)
                }
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
              <label className="block text-xs text-muted mb-1">
                Time <span className="text-subtle font-normal">(optional)</span>
              </label>
              <Input
                type="time"
                value={meal.time ?? ''}
                onChange={e => actions.updateMeal(index, 'time', e.target.value || null)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-muted mb-1">Name</label>
              <Input
                value={meal.name}
                onChange={e => actions.updateMeal(index, 'name', e.target.value)}
                placeholder="e.g., Greek Yogurt with Berries"
              />
            </div>
            <div className="md:col-span-6">
              <label className="block text-xs text-muted mb-1">Description</label>
              <Input
                value={meal.description}
                onChange={e => actions.updateMeal(index, 'description', e.target.value)}
                placeholder="Prep notes, instructions, etc."
              />
            </div>
          </div>

          <div className="bg-elevated rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Meal totals
            </span>
            <MacroSummary macros={mealMacros} />
          </div>

          <div className="mt-3 pt-3 border-t border-line-subtle">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                Items
              </span>
              <Button variant="secondary" size="sm" onClick={() => actions.addFood(index)}>
                <Plus size={12} />
                Add Item
              </Button>
            </div>

            {(meal.foods?.length ?? 0) === 0 ? (
              <p className="text-xs text-subtle italic">
                Add items to this meal. An item can be a single thing
                (e.g. &ldquo;1 tbsp olive oil&rdquo;) or a recipe broken into ingredients.
              </p>
            ) : (
              <div className="space-y-3">
                {meal.foods!.map((food, foodIndex) => {
                  const hasIngredients = (food.ingredients?.length ?? 0) > 0
                  const foodMacros = computeFoodMacros(food)
                  const expanded = isFoodExpanded(foodIndex)
                  return (
                    <div key={foodIndex} className="bg-elevated rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        {hasIngredients && (
                          <button
                            type="button"
                            onClick={() => actions.toggleFoodExpanded(index, foodIndex)}
                            aria-label={expanded ? 'Collapse item' : 'Expand item'}
                            aria-expanded={expanded}
                            className="mt-2 text-subtle hover:text-foreground cursor-pointer shrink-0"
                          >
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <Input
                            value={food.name}
                            onChange={e =>
                              actions.updateFood(index, foodIndex, 'name', e.target.value)
                            }
                            placeholder={hasIngredients ? 'Recipe name' : 'Item name'}
                            className="text-sm"
                          />
                        </div>
                        {!hasIngredients && (
                          <div className="w-44 shrink-0">
                            <QuantityInput
                              value={food.quantity}
                              onChange={v =>
                                actions.updateFood(index, foodIndex, 'quantity', v)
                              }
                            />
                          </div>
                        )}
                        <IconButton
                          tone="danger"
                          onClick={() => actions.removeFood(index, foodIndex)}
                          aria-label="Remove item"
                        >
                          <X size={14} />
                        </IconButton>
                      </div>

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
                              <label className="block text-[10px] text-muted mb-1">
                                {label}
                              </label>
                              <Input
                                type="number"
                                step="any"
                                min="0"
                                value={food[field] ?? ''}
                                onChange={e =>
                                  actions.updateFood(
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

                      {hasIngredients && !expanded && (
                        <div className="mt-2 ml-6 flex items-center gap-3 text-xs text-muted">
                          <span>
                            {food.ingredients!.length}{' '}
                            {food.ingredients!.length === 1 ? 'ingredient' : 'ingredients'}
                          </span>
                          <span className="text-faint">&middot;</span>
                          <MacroSummary macros={foodMacros} className="text-[11px]" />
                        </div>
                      )}

                      {hasIngredients && expanded && (
                        <>
                          <div className="mt-2 bg-surface border border-line rounded-md px-2 py-1.5 flex items-center justify-between flex-wrap gap-2">
                            <span className="text-[10px] text-subtle italic">
                              Auto-calculated from ingredients
                            </span>
                            <MacroSummary macros={foodMacros} />
                          </div>

                          <div className="mt-2 ml-4 pl-3 border-l-2 border-line">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-semibold text-subtle uppercase tracking-wide">
                                Ingredients
                              </span>
                              <button
                                type="button"
                                onClick={() => actions.addIngredient(index, foodIndex)}
                                className="text-[10px] font-medium text-indigo-fg hover:text-indigo-fg-strong cursor-pointer"
                              >
                                + Add Ingredient
                              </button>
                            </div>

                            <div className="space-y-1">
                              {food.ingredients!.map((ing, ingIndex) => (
                                <IngredientRow
                                  key={ingIndex}
                                  ingredient={ing}
                                  catalog={catalog}
                                  onChange={(field, value) =>
                                    actions.updateIngredient(
                                      index,
                                      foodIndex,
                                      ingIndex,
                                      field,
                                      value
                                    )
                                  }
                                  onPickSuggestion={entry =>
                                    actions.replaceIngredient(index, foodIndex, ingIndex, entry)
                                  }
                                  onRemove={() =>
                                    actions.removeIngredient(index, foodIndex, ingIndex)
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      <div className="mt-2 ml-4 pl-3 border-l-2 border-line">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-semibold text-subtle uppercase tracking-wide">
                            Alternatives
                          </span>
                          <button
                            type="button"
                            onClick={() => actions.addFoodAlternative(index, foodIndex)}
                            className="text-[10px] font-medium text-indigo-fg hover:text-indigo-fg-strong cursor-pointer"
                          >
                            + Add Alternative
                          </button>
                        </div>
                        {(food.alternatives ?? []).length === 0 ? (
                          <p className="text-[10px] text-subtle italic px-1 py-0.5">
                            None yet. Add &ldquo;Greek yogurt&rdquo; or &ldquo;Cottage
                            cheese&rdquo; so clients can swap if they don&rsquo;t have
                            the original on hand.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {(food.alternatives ?? []).map((alt, altIdx) => (
                              <IngredientRow
                                key={altIdx}
                                ingredient={alt}
                                onChange={(field, value) =>
                                  actions.updateFoodAlternative(
                                    index,
                                    foodIndex,
                                    altIdx,
                                    field as keyof FoodAlternative,
                                    value
                                  )
                                }
                                onRemove={() =>
                                  actions.removeFoodAlternative(index, foodIndex, altIdx)
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
  )
}
