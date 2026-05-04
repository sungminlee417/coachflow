'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { WeekSelector } from '@/components/ui/WeekSelector'
import { Flame, Beef, Wheat, Droplet, Trash2 } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import {
  todayISO,
  formatLongDate,
  unwrapJoin,
  computeFoodMacros,
  computeMealMacros,
  roundMacro,
  weekdayOf,
  formatTime,
} from '@/lib/utils'
import type { Meal, MealPlanAssignment, Food, Ingredient } from '@/lib/types'

interface ClientMealPlanViewProps {
  clientId: string
}

const MEAL_TYPE_ORDER: Record<Meal['meal_type'], number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
}

const DAY_SHORT: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
}

export default function ClientMealPlanView({ clientId }: ClientMealPlanViewProps) {
  const supabase = useSupabase()
  const [assignments, setAssignments] = useState<MealPlanAssignment[]>([])
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingUnassign, setPendingUnassign] = useState<{ id: string; name: string } | null>(null)

  const handleUnassign = async () => {
    if (!pendingUnassign) return
    try {
      const { error } = await supabase
        .from('meal_plan_assignments')
        .delete()
        .eq('id', pendingUnassign.id)
      if (error) throw error
      showToast('Meal plan removed')
      await fetchAssignments()
    } catch {
      showToast('Failed to remove meal plan', 'error')
    } finally {
      setPendingUnassign(null)
    }
  }

  const fetchAssignments = async () => {
    setLoading(true)
    try {
      // An assignment is active on selectedDate if:
      //   (start_date IS NULL OR start_date <= selectedDate)
      //   AND (end_date IS NULL OR end_date >= selectedDate)
      const { data, error } = await supabase
        .from('meal_plan_assignments')
        .select(`
          id, start_date, end_date, notes, coach_id,
          meal_plan:meal_plan_id (
            id, name, description,
            meals (
              id, meal_type, name, description, days_of_week, time, order_index,
              foods (
                id, name, quantity, calories, protein_grams, carbs_grams, fat_grams, order_index,
                ingredients ( id, name, quantity, calories, protein_grams, carbs_grams, fat_grams, order_index )
              )
            )
          )
        `)
        .eq('client_id', clientId)
        .or(`start_date.is.null,start_date.lte.${selectedDate}`)
        .or(`end_date.is.null,end_date.gte.${selectedDate}`)

      if (error) throw error

      // Determine the weekday (0=Sun..6=Sat) of the selected date in local time.
      const weekday = weekdayOf(selectedDate)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalized = (data || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => {
          const plan = unwrapJoin<{
            id: string
            name: string
            description: string
            meals: Meal[]
          }>(item.meal_plan)
          return {
            ...item,
            meal_plan: {
              ...plan,
              meals: (plan?.meals || [])
                // Filter to meals scheduled for this weekday.
                // Empty days_of_week = "every day" (always show).
                .filter((m: Meal) => {
                  const days = m.days_of_week ?? []
                  return days.length === 0 || days.includes(weekday as Meal['days_of_week'][number])
                })
                .map((m: Meal) => ({
                  ...m,
                  days_of_week: m.days_of_week ?? [],
                  foods: (m.foods || [])
                    .slice()
                    .sort((a: Food, b: Food) => a.order_index - b.order_index)
                    .map((f: Food) => ({
                      ...f,
                      ingredients: (f.ingredients || [])
                        .slice()
                        .sort((a: Ingredient, b: Ingredient) => a.order_index - b.order_index),
                    })),
                }))
                .sort((a: Meal, b: Meal) => {
                  // Meals with a time come first, sorted chronologically.
                  // Untimed meals fall back to meal-type order, then index.
                  if (a.time && b.time) return a.time.localeCompare(b.time)
                  if (a.time) return -1
                  if (b.time) return 1
                  return (
                    MEAL_TYPE_ORDER[a.meal_type] - MEAL_TYPE_ORDER[b.meal_type] ||
                    a.order_index - b.order_index
                  )
                }),
            },
          }
        })
        // Drop assignments where every meal got filtered out — nothing to show.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((item: any) => (item.meal_plan?.meals?.length ?? 0) > 0)

      setAssignments(normalized)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAssignments() }, [selectedDate])

  // Compute daily totals from all meal plan assignments → meals → foods
  const dailyTotals = assignments.reduce(
    (acc, a) => {
      a.meal_plan.meals.forEach(m => {
        const mm = computeMealMacros(m)
        acc.calories += mm.calories
        acc.protein += mm.protein_grams
        acc.carbs += mm.carbs_grams
        acc.fat += mm.fat_grams
      })
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const macroCards = [
    { icon: Flame, label: 'Calories', value: dailyTotals.calories, suffix: '' },
    { icon: Beef, label: 'Protein', value: dailyTotals.protein, suffix: 'g' },
    { icon: Wheat, label: 'Carbs', value: dailyTotals.carbs, suffix: 'g' },
    { icon: Droplet, label: 'Fat', value: dailyTotals.fat, suffix: 'g' },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-4">My Meals</h2>

      <WeekSelector selectedDate={selectedDate} onSelect={setSelectedDate} tone="success" />

      <h3 className="text-lg font-semibold mb-4">{formatLongDate(selectedDate)}</h3>

      {assignments.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {macroCards.map(({ icon: Icon, label, value, suffix }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Icon size={14} />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {roundMacro(value)}
                {suffix && <span className="text-sm text-slate-400 font-normal ml-1">{suffix}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading...</div>
      ) : assignments.length === 0 ? (
        <div className="bg-slate-50 rounded-xl p-8 text-center">
          <p className="text-slate-500">No meal plans assigned for this day</p>
          <p className="text-sm text-slate-400 mt-2">
            Check other days or assign yourself one from My Meal Plans
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map(assignment => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const isOwnAssignment = (assignment as any).coach_id === clientId
            return (
            <div key={assignment.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-slate-900 mb-1">{assignment.meal_plan.name}</h3>
                    {assignment.meal_plan.description && (
                      <p className="text-slate-600 text-sm">{assignment.meal_plan.description}</p>
                    )}
                    {assignment.notes && (
                      <p className="text-indigo-600 text-sm mt-2 italic">
                        Coach note: {assignment.notes}
                      </p>
                    )}
                  </div>
                  {isOwnAssignment && (
                    <IconButton
                      tone="danger"
                      onClick={() =>
                        setPendingUnassign({
                          id: assignment.id,
                          name: assignment.meal_plan.name,
                        })
                      }
                      aria-label="Unassign meal plan"
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  )}
                </div>

                <button
                  onClick={() => setExpanded(expanded === assignment.id ? null : assignment.id)}
                  className="w-full text-left text-emerald-600 hover:text-emerald-800 font-medium text-sm cursor-pointer"
                >
                  {expanded === assignment.id ? '▼ Hide' : '▶ Show'} Meals (
                  {assignment.meal_plan.meals.length})
                </button>

                {expanded === assignment.id && (
                  <div className="mt-4 space-y-3">
                    {assignment.meal_plan.meals.map(meal => {
                      const mealMacros = computeMealMacros(meal)
                      return (
                        <div key={meal.id} className="bg-slate-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                              {meal.meal_type}
                            </span>
                            {meal.time && (
                              <span className="text-xs font-semibold text-slate-700 tabular-nums">
                                {formatTime(meal.time)}
                              </span>
                            )}
                            {meal.days_of_week && meal.days_of_week.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {[...meal.days_of_week]
                                  .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                                  .map(d => (
                                    <span
                                      key={d}
                                      className="text-[10px] font-semibold uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5"
                                    >
                                      {DAY_SHORT[d]}
                                    </span>
                                  ))}
                              </div>
                            )}
                          </div>
                          <p className="font-semibold text-slate-900">{meal.name}</p>
                          {meal.description && (
                            <p className="text-sm text-slate-600 mb-2">{meal.description}</p>
                          )}

                          <div className="grid grid-cols-4 gap-2 text-xs mt-2">
                            <div className="text-slate-600">
                              <span className="text-slate-400">Cal:</span>{' '}
                              <span className="font-medium">{roundMacro(mealMacros.calories)}</span>
                            </div>
                            <div className="text-slate-600">
                              <span className="text-slate-400">P:</span>{' '}
                              <span className="font-medium">{roundMacro(mealMacros.protein_grams)}g</span>
                            </div>
                            <div className="text-slate-600">
                              <span className="text-slate-400">C:</span>{' '}
                              <span className="font-medium">{roundMacro(mealMacros.carbs_grams)}g</span>
                            </div>
                            <div className="text-slate-600">
                              <span className="text-slate-400">F:</span>{' '}
                              <span className="font-medium">{roundMacro(mealMacros.fat_grams)}g</span>
                            </div>
                          </div>

                          {meal.foods && meal.foods.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                                Items
                              </p>
                              <ul className="space-y-2">
                                {meal.foods.map(food => {
                                  const fm = computeFoodMacros(food)
                                  const isRecipe = (food.ingredients?.length ?? 0) > 0
                                  return (
                                    <li key={food.id}>
                                      <div className="text-sm text-slate-700 flex items-baseline justify-between gap-3">
                                        <span>
                                          <span className="font-medium">{food.name}</span>
                                          {!isRecipe && food.quantity && (
                                            <span className="text-slate-500"> — {food.quantity}</span>
                                          )}
                                        </span>
                                        {(fm.calories > 0 || fm.protein_grams > 0) && (
                                          <span className="text-xs text-slate-400 whitespace-nowrap">
                                            {fm.calories > 0 && `${roundMacro(fm.calories)} cal`}
                                            {fm.protein_grams > 0 &&
                                              ` · ${roundMacro(fm.protein_grams)}g P`}
                                          </span>
                                        )}
                                      </div>
                                      {food.ingredients && food.ingredients.length > 0 && (
                                        <ul className="mt-1 ml-4 pl-3 border-l-2 border-slate-200 space-y-0.5">
                                          {food.ingredients.map(ing => (
                                            <li
                                              key={ing.id}
                                              className="text-xs text-slate-600 flex items-baseline justify-between gap-3"
                                            >
                                              <span>
                                                <span>{ing.name}</span>
                                                {ing.quantity && (
                                                  <span className="text-slate-400">
                                                    {' '}
                                                    — {ing.quantity}
                                                  </span>
                                                )}
                                              </span>
                                              {(ing.calories != null || ing.protein_grams != null) && (
                                                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                  {ing.calories != null &&
                                                    `${roundMacro(ing.calories)} cal`}
                                                  {ing.protein_grams != null &&
                                                    ` · ${roundMacro(ing.protein_grams)}g P`}
                                                </span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingUnassign}
        title="Unassign meal plan?"
        message={
          pendingUnassign
            ? `"${pendingUnassign.name}" will be removed from your assigned meals. This cannot be undone.`
            : ''
        }
        confirmLabel="Unassign"
        destructive
        onConfirm={handleUnassign}
        onCancel={() => setPendingUnassign(null)}
      />
    </div>
  )
}
