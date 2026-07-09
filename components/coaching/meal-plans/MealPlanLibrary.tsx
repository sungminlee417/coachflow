'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { useAssignmentSync } from '@/lib/hooks/use-assignment-sync'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardGridSkeleton } from '@/components/ui/Skeleton'
import { sortLibrary, type LibrarySortMode } from '@/components/ui/LibrarySort'
import { LibraryFilterableGrid } from '@/components/ui/LibraryFilterableGrid'
import { Plus, Send, Pencil, Trash2, Apple, Copy } from 'lucide-react'
import { stripMeta, mapByOrderIndex } from '@/lib/copy-utils'
import type { MealPlan } from '@/lib/types'
import dynamic from 'next/dynamic'
// Lazy-loaded — the builder is the heaviest screen in the app (~1400 LOC
// + drag/drop) and is only mounted after the coach taps "Create / Edit".
const MealPlanBuilder = dynamic(() => import('./MealPlanBuilder'), { ssr: false })
import MealPlanAssignmentModal from '../assignments/MealPlanAssignmentModal'

interface MealPlanLibraryProps {
  coachId: string
}

export default function MealPlanLibrary({ coachId }: MealPlanLibraryProps) {
  const supabase = useSupabase()
  const { invalidateMealPlans } = useAssignmentSync()
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingPlan, setEditingPlan] = useState<MealPlan | null>(null)
  const [assigningPlan, setAssigningPlan] = useState<MealPlan | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<LibrarySortMode>('recent')

  const visiblePlans = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? plans.filter(p => p.name.toLowerCase().includes(q))
      : plans
    return sortLibrary(filtered, sortMode)
  }, [plans, query, sortMode])

  useEffect(() => {
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, name, description, is_template, created_at, meals (count)')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const list = (data || []).map(p => ({
        ...p,
        meal_count: p.meals?.[0]?.count || 0,
      }))
      setPlans(list)
    } catch (err) {
      console.error('fetchPlans failed:', err)
      showToast('Failed to load meal plans', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const { error } = await supabase.from('meal_plans').delete().eq('id', deletingId)
      if (error) throw error
      // Invalidate trainee-facing caches so deleted plan doesn't ghost in active views.
      await Promise.all([fetchPlans(), invalidateMealPlans({ coachId })])
      showToast('Meal plan deleted')
    } catch {
      showToast('Failed to delete meal plan', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDuplicate = async (mealPlanId: string) => {
    setDuplicatingId(mealPlanId)
    try {
      const { data: src } = await supabase.from('meal_plans').select('*').eq('id', mealPlanId).maybeSingle()
      if (!src) throw new Error('Source not found')

      const { data: plan, error: planErr } = await supabase
        .from('meal_plans')
        .insert({ ...stripMeta(src), name: `${src.name} (copy)`, coach_id: coachId })
        .select('id')
        .single()
      if (planErr || !plan) throw planErr ?? new Error('Insert failed')

      const { data: meals } = await supabase
        .from('meals').select('*').eq('meal_plan_id', mealPlanId).order('order_index')

      if (meals?.length) {
        const oldMealIds = meals.map(m => m.id as string)
        const { data: newMeals, error: mealErr } = await supabase
          .from('meals')
          .insert(meals.map(m => ({ ...stripMeta(m), meal_plan_id: plan.id })))
          .select('id, order_index')
        if (mealErr) throw mealErr

        const mealIdMap = mapByOrderIndex(
          meals as Array<{ id: string; order_index: number }>,
          (newMeals ?? []) as Array<{ id: string; order_index: number }>
        )

        const { data: foods } = await supabase.from('foods').select('*').in('meal_id', oldMealIds)
        if (foods?.length) {
          const oldFoodIds = foods.map(f => f.id as string)
          const foodPayload = foods.flatMap(f => {
            const newMealId = mealIdMap.get(f.meal_id as string)
            return newMealId ? [{ ...stripMeta(f), meal_id: newMealId }] : []
          })
          const { data: newFoods, error: foodErr } = await supabase
            .from('foods').insert(foodPayload).select('id, meal_id, order_index')
          if (foodErr) throw foodErr

          // Foods share order_index within a meal, so key the lookup on (oldMealId, order_index).
          const reverseMealMap = new Map([...mealIdMap].map(([o, n]) => [n, o]))
          const oldFoodByKey = new Map(
            (foods as Array<{ id: string; meal_id: string; order_index: number }>)
              .map(f => [`${f.meal_id}::${f.order_index}`, f.id])
          )
          const foodIdMap = new Map<string, string>()
          for (const n of (newFoods ?? []) as Array<{ id: string; meal_id: string; order_index: number }>) {
            const oldMealId = reverseMealMap.get(n.meal_id)
            const oldFoodId = oldFoodByKey.get(`${oldMealId}::${n.order_index}`)
            if (oldFoodId) foodIdMap.set(oldFoodId, n.id)
          }

          try {
            const { data: ings } = await supabase.from('ingredients').select('*').in('food_id', oldFoodIds)
            const ingPayload = (ings ?? []).flatMap(ing => {
              const newFoodId = foodIdMap.get(ing.food_id as string)
              return newFoodId ? [{ ...stripMeta(ing), food_id: newFoodId }] : []
            })
            if (ingPayload.length) await supabase.from('ingredients').insert(ingPayload)
          } catch { /* ingredients table may be absent on older deploys */ }

          try {
            const { data: alts } = await supabase.from('food_alternatives').select('*').in('food_id', oldFoodIds)
            const altPayload = (alts ?? []).flatMap(a => {
              const newFoodId = foodIdMap.get(a.food_id as string)
              return newFoodId ? [{ ...stripMeta(a), food_id: newFoodId }] : []
            })
            if (altPayload.length) await supabase.from('food_alternatives').insert(altPayload)
          } catch { /* food_alternatives table may be absent on older deploys */ }
        }
      }

      await fetchPlans()
      showToast('Meal plan duplicated')
    } catch (err) {
      console.error('handleDuplicate failed:', err)
      showToast('Failed to duplicate meal plan', 'error')
    } finally {
      setDuplicatingId(null)
    }
  }

  if (showBuilder) {
    return (
      <MealPlanBuilder
        coachId={coachId}
        mealPlan={editingPlan}
        onClose={() => {
          setShowBuilder(false)
          setEditingPlan(null)
          fetchPlans()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Meal Plan Library</h2>
            <p className="text-sm text-subtle mt-1">Loading meal plans…</p>
          </div>
        </div>
        <CardGridSkeleton count={6} />
      </div>
    )
  }

  return (
    <div>
      <MealPlanAssignmentModal
        open={!!assigningPlan}
        coachId={coachId}
        mealPlanId={assigningPlan?.id ?? ''}
        mealPlanName={assigningPlan?.name ?? ''}
        onClose={() => setAssigningPlan(null)}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Delete meal plan?"
        message="This will permanently remove the meal plan and its meals. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Meal Plans</h2>
          <p className="text-sm text-muted mt-1">
            {plans.length} {plans.length === 1 ? 'meal plan' : 'meal plans'}
          </p>
        </div>
        <Button onClick={() => { setEditingPlan(null); setShowBuilder(true) }}>
          <Plus size={16} />
          Create Meal Plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={Apple}
          title="No meal plans yet"
          description="Create your first meal plan template"
          action={
            <Button onClick={() => { setEditingPlan(null); setShowBuilder(true) }}>
              <Plus size={16} />
              Create Your First Meal Plan
            </Button>
          }
        />
      ) : (
        <LibraryFilterableGrid
          total={plans.length}
          visibleCount={visiblePlans.length}
          query={query}
          onQueryChange={setQuery}
          sortMode={sortMode}
          onSortChange={setSortMode}
          searchPlaceholder="Search meal plans…"
          emptyMatchLabel="meal plans"
        >
          {visiblePlans.map(plan => (
            <div
              key={plan.id}
              className="bg-surface rounded-xl border border-line p-5 flex flex-col gap-3 transition-all hover:border-emerald-line hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground leading-snug">{plan.name}</h3>
                {plan.is_template && (
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-soft text-purple-fg border border-purple-line rounded-full">
                    Template
                  </span>
                )}
              </div>

              <div className="flex-1">
                {plan.description && (
                  <p className="text-sm text-muted line-clamp-2">{plan.description}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-elevated text-xs text-subtle font-medium">
                  <Apple size={11} className="text-emerald-500" />
                  {plan.meal_count} {plan.meal_count === 1 ? 'meal' : 'meals'}
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    onClick={() => { setEditingPlan(plan); setShowBuilder(true) }}
                    aria-label="Edit meal plan"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton
                    onClick={() => handleDuplicate(plan.id)}
                    aria-label="Duplicate meal plan"
                    title="Duplicate"
                    disabled={duplicatingId === plan.id}
                  >
                    <Copy size={15} />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    onClick={() => setDeletingId(plan.id)}
                    aria-label="Delete meal plan"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>

              <Button onClick={() => setAssigningPlan(plan)} variant="secondary" className="w-full">
                <Send size={14} />
                Assign to client
              </Button>
            </div>
          ))}
        </LibraryFilterableGrid>
      )}
    </div>
  )
}
