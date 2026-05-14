'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { WeekSelector } from '@/components/ui/WeekSelector'
import { Bell, Flame, Beef, Wheat, Droplet, Trash2, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { AssignmentCardSkeleton } from '@/components/ui/Skeleton'
import { showToast } from '@/components/ui/Toast'
import { MealLogToggle } from './MealLogToggle'
import {
  todayISO,
  formatLongDate,
  computeFoodMacros,
  computeMealMacros,
  roundMacro,
  formatTime,
  mealDisplayName,
  numberMealsForDay,
} from '@/lib/utils'
import { fetchActiveMealPlanAssignments } from '@/lib/queries'
import { cachedFetch, cachedQuery } from '@/lib/cached-query'
import type { MealPlanAssignment } from '@/lib/types'

interface ClientMealPlanViewProps {
  clientId: string
}

export default function ClientMealPlanView({ clientId }: ClientMealPlanViewProps) {
  const supabase = useSupabase()
  const [assignments, setAssignments] = useState<MealPlanAssignment[]>([])
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  // Set of meal_ids eaten on the selectedDate. Source of truth for the
  // per-meal toggle's checked state and the daily progress chip.
  const [eatenMealIds, setEatenMealIds] = useState<Set<string>>(new Set())
  const [logsLoaded, setLogsLoaded] = useState(false)
  // Per-session dismissal of the missed-meal banner so the user can hide it
  // without it nagging them again on the same day.
  const [missedBannerDismissed, setMissedBannerDismissed] = useState(false)
  // Tick every minute so the missed-meal banner updates as scheduled times
  // come and go without requiring a route change. `minuteTick` is read so
  // it can serve as a useMemo dependency below — without binding it the
  // missed-meal computation would never recompute as the clock advances.
  const [minuteTick, setMinuteTick] = useState(0)
  useEffect(() => {
    const handle = window.setInterval(() => setMinuteTick(n => n + 1), 60_000)
    return () => window.clearInterval(handle)
  }, [])
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
    const { data } = await cachedFetch(
      `meal_plan_assignments:${clientId}:${selectedDate}`,
      () => fetchActiveMealPlanAssignments(supabase, clientId, selectedDate)
    )
    setAssignments(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAssignments() }, [selectedDate])

  // Reset the banner-dismiss state whenever the user navigates to a new date —
  // a fresh day deserves a fresh nudge.
  useEffect(() => {
    setMissedBannerDismissed(false)
  }, [selectedDate])

  // 30-minute grace period after the scheduled time before we count a meal
  // as "missed". Avoids nagging the user the moment the clock ticks past.
  const MISSED_GRACE_MS = 30 * 60 * 1000

  // Stable "Meal N of the day" numbering shared across the missed-meal
  // banner and the per-meal cards below. Flattens every active meal-plan
  // assignment for `selectedDate` into one chronological list so the same
  // meal always gets the same number wherever it shows up.
  const mealNumberById = useMemo(() => {
    const flat: { id?: string | null; time?: string | null }[] = []
    for (const a of assignments) {
      for (const m of a.meal_plan.meals) flat.push({ id: m.id, time: m.time })
    }
    return numberMealsForDay(flat)
  }, [assignments])

  // Memoized so the nested loops only re-run when the inputs actually
  // change. `minuteTick` is intentionally in the deps so the banner
  // updates as the clock crosses each scheduled meal time.
  const missedMeals = useMemo(() => {
    if (selectedDate !== todayISO())
      return [] as { id: string; name: string; time: string }[]
    const now = Date.now()
    const out: { id: string; name: string; time: string }[] = []
    for (const a of assignments) {
      for (const m of a.meal_plan.meals) {
        if (!m.id || !m.time) continue
        if (eatenMealIds.has(m.id)) continue
        const [h, mi] = m.time.split(':').map(Number)
        if (Number.isNaN(h) || Number.isNaN(mi)) continue
        const scheduled = new Date()
        scheduled.setHours(h, mi, 0, 0)
        if (now <= scheduled.getTime() + MISSED_GRACE_MS) continue
        out.push({ id: m.id, name: m.name, time: m.time })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- MISSED_GRACE_MS is a constant
  }, [selectedDate, assignments, eatenMealIds, minuteTick])

  // Load meal_logs for the selected date so the toggle reflects what the user
  // already checked off. Independent of fetchAssignments — runs in parallel.
  // Routed through cachedQuery so a previously-visited day shows the right
  // "eaten" state offline.
  useEffect(() => {
    let cancelled = false
    setLogsLoaded(false)
    setEatenMealIds(new Set())
    ;(async () => {
      const { data } = await cachedQuery<
        Array<{ meal_id: string; completed: boolean }>
      >(
        `meal_logs:${clientId}:${selectedDate}`,
        () =>
          supabase
            .from('meal_logs')
            .select('meal_id, completed')
            .eq('user_id', clientId)
            .eq('logged_date', selectedDate)
      )
      if (cancelled) return
      const eaten = new Set<string>()
      ;(data ?? []).forEach(row => {
        if (row.completed) eaten.add(row.meal_id)
      })
      setEatenMealIds(eaten)
      setLogsLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [clientId, selectedDate, supabase])

  const setMealEaten = (mealId: string, eaten: boolean) => {
    setEatenMealIds(prev => {
      const next = new Set(prev)
      if (eaten) next.add(mealId)
      else next.delete(mealId)
      return next
    })
  }

  // Per-day aggregates. Memoized so a re-render from an unrelated state
  // change (modal open, missed-banner dismissed) doesn't recompute over
  // every meal + food + ingredient just to render the same totals.
  const { totalMealsToday, eatenCountToday, dailyTotals } = useMemo(() => {
    let totalMeals = 0
    let eatenCount = 0
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 }
    for (const a of assignments) {
      for (const m of a.meal_plan.meals) {
        totalMeals += 1
        if (m.id && eatenMealIds.has(m.id)) eatenCount += 1
        const mm = computeMealMacros(m)
        totals.calories += mm.calories
        totals.protein += mm.protein_grams
        totals.carbs += mm.carbs_grams
        totals.fat += mm.fat_grams
      }
    }
    return {
      totalMealsToday: totalMeals,
      eatenCountToday: eatenCount,
      dailyTotals: totals,
    }
  }, [assignments, eatenMealIds])

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

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-lg font-semibold">{formatLongDate(selectedDate)}</h3>
        {totalMealsToday > 0 && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border tabular-nums ${
              eatenCountToday === totalMealsToday
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
            aria-live="polite"
          >
            {eatenCountToday} / {totalMealsToday} eaten
          </span>
        )}
      </div>

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

      {!loading &&
        logsLoaded &&
        !missedBannerDismissed &&
        missedMeals.length > 0 && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
            <Bell size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {missedMeals.length === 1
                  ? "Don't forget to log this meal"
                  : `Don't forget to log ${missedMeals.length} meals`}
              </p>
              <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
                {missedMeals.map(m => (
                  <li key={m.id}>
                    <span className="font-medium">
                      {mealDisplayName(m.name, mealNumberById.get(m.id))}
                    </span>
                    {' · '}
                    <span className="tabular-nums">{formatTime(m.time)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setMissedBannerDismissed(true)}
              className="h-7 w-7 flex items-center justify-center rounded-md text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss reminder"
            >
              <X size={14} />
            </button>
          </div>
        )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <AssignmentCardSkeleton key={i} withChips />
          ))}
        </div>
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
            const isOwnAssignment = assignment.coach_id === clientId
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
                      const eaten = !!meal.id && eatenMealIds.has(meal.id)
                      return (
                        <div
                          key={meal.id}
                          className={`rounded-lg p-4 transition-colors ${
                            eaten ? 'bg-emerald-50/60 border border-emerald-200' : 'bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                                {meal.meal_type}
                              </span>
                              {meal.time && (
                                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                                  {formatTime(meal.time)}
                                </span>
                              )}
                              {eaten && (
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">
                                  Eaten
                                </span>
                              )}
                            </div>
                            {meal.id && (
                              <MealLogToggle
                                assignmentId={assignment.id}
                                mealId={meal.id}
                                userId={clientId}
                                loggedDate={selectedDate}
                                completed={eaten}
                                loaded={logsLoaded}
                                onToggled={next => setMealEaten(meal.id!, next)}
                              />
                            )}
                          </div>
                          <p className="font-semibold text-slate-900">
                            {mealDisplayName(meal.name, mealNumberById.get(meal.id ?? ''))}
                          </p>
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
                                      {food.alternatives && food.alternatives.length > 0 && (
                                        <ul className="mt-1 ml-4 pl-3 border-l-2 border-emerald-200 space-y-0.5">
                                          {food.alternatives.map((alt, i) => {
                                            const macroBits: string[] = []
                                            if (alt.calories != null && alt.calories > 0)
                                              macroBits.push(`${roundMacro(alt.calories)} cal`)
                                            if (alt.protein_grams != null && alt.protein_grams > 0)
                                              macroBits.push(`${roundMacro(alt.protein_grams)}g P`)
                                            return (
                                              <li
                                                key={alt.id ?? i}
                                                className="text-xs text-slate-600 flex items-baseline justify-between gap-3"
                                              >
                                                <span>
                                                  <span className="text-[9px] font-semibold uppercase tracking-widest text-emerald-700 mr-1.5">
                                                    or
                                                  </span>
                                                  <span className="font-medium">{alt.name}</span>
                                                  {alt.quantity && (
                                                    <span className="text-slate-400"> — {alt.quantity}</span>
                                                  )}
                                                </span>
                                                {macroBits.length > 0 && (
                                                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                    {macroBits.join(' · ')}
                                                  </span>
                                                )}
                                              </li>
                                            )
                                          })}
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
