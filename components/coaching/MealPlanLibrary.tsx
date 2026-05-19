'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardGridSkeleton } from '@/components/ui/Skeleton'
import { LibrarySearch } from '@/components/ui/LibrarySearch'
import { LibrarySort, sortLibrary, type LibrarySortMode } from '@/components/ui/LibrarySort'
import { Plus, Send, Pencil, Trash2, Apple, Copy } from 'lucide-react'
import type { MealPlan } from '@/lib/types'
import dynamic from 'next/dynamic'
// Lazy-loaded — the builder is the heaviest screen in the app (~1400 LOC
// + drag/drop) and is only mounted after the coach taps "Create / Edit".
const MealPlanBuilder = dynamic(() => import('./MealPlanBuilder'), { ssr: false })
import MealPlanAssignmentModal from './MealPlanAssignmentModal'

interface MealPlanLibraryProps {
  coachId: string
}

export default function MealPlanLibrary({ coachId }: MealPlanLibraryProps) {
  const supabase = useSupabase()
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingPlan, setEditingPlan] = useState<MealPlan | null>(null)
  const [assigningPlan, setAssigningPlan] = useState<MealPlan | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      const { error } = await supabase.from('meal_plans').delete().eq('id', deletingId)
      if (error) throw error
      await fetchPlans()
      showToast('Meal plan deleted')
    } catch {
      showToast('Failed to delete meal plan', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Deep-copy a meal plan: header → meals → foods → (ingredients +
  // food_alternatives). At each level we map old-id → new-id by index
  // so the child re-inserts point at the right new parent. The deepest
  // child rows (ingredients/food_alternatives) are best-effort; if a
  // table is missing on an older deploy we skip rather than fail the
  // whole duplicate.
  const handleDuplicate = async (mealPlanId: string) => {
    try {
      const { data: src } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('id', mealPlanId)
        .maybeSingle()
      if (!src) throw new Error('Meal plan not found')

      const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = src as {
        id: string
        created_at?: string
        updated_at?: string
        name: string
      } & Record<string, unknown>
      void _id; void _ca; void _ua
      const newPayload = {
        ...rest,
        name: `${src.name} (copy)`,
        coach_id: coachId,
      }
      const { data: created, error: insertErr } = await supabase
        .from('meal_plans')
        .insert(newPayload)
        .select('id')
        .single()
      if (insertErr || !created) throw insertErr ?? new Error('Insert failed')
      const newPlanId = created.id as string

      const { data: mealRows } = await supabase
        .from('meals')
        .select('*')
        .eq('meal_plan_id', mealPlanId)
        .order('order_index')

      if (mealRows && mealRows.length > 0) {
        type MealRow = { id: string; meal_plan_id: string } & Record<string, unknown>
        const oldMealIds = (mealRows as MealRow[]).map(m => m.id)
        const mealsPayload = (mealRows as MealRow[]).map(m => {
          const { id: _mid, created_at: _mca, meal_plan_id: _mpid, ...mRest } =
            m as MealRow & { created_at?: string }
          void _mid; void _mca; void _mpid
          return { ...mRest, meal_plan_id: newPlanId }
        })
        const { data: newMealRows, error: mealErr } = await supabase
          .from('meals')
          .insert(mealsPayload)
          .select('id, order_index')
        if (mealErr) throw mealErr

        // Map old meal id → new meal id by order_index, then carry
        // foods over the same way.
        const oldMealByOrder = new Map<number, string>()
        for (const o of mealRows as Array<{ id: string; order_index: number }>) {
          oldMealByOrder.set(o.order_index, o.id)
        }
        const newMealByOldId = new Map<string, string>()
        for (const n of (newMealRows ?? []) as Array<{ id: string; order_index: number }>) {
          const oldId = oldMealByOrder.get(n.order_index)
          if (oldId) newMealByOldId.set(oldId, n.id)
        }

        const { data: foodRows } = await supabase
          .from('foods')
          .select('*')
          .in('meal_id', oldMealIds)
        if (foodRows && foodRows.length > 0) {
          type FoodRow = { id: string; meal_id: string } & Record<string, unknown>
          const oldFoodIds = (foodRows as FoodRow[]).map(f => f.id)
          const foodsPayload: Record<string, unknown>[] = []
          for (const f of foodRows as FoodRow[]) {
            const { id: _fid, created_at: _fca, meal_id: oldMealId, ...fRest } =
              f as FoodRow & { created_at?: string }
            void _fid; void _fca
            const newMealId = newMealByOldId.get(oldMealId)
            if (!newMealId) continue
            foodsPayload.push({ ...fRest, meal_id: newMealId })
          }
          if (foodsPayload.length > 0) {
            const { data: newFoodRows, error: foodErr } = await supabase
              .from('foods')
              .insert(foodsPayload)
              .select('id, meal_id, order_index')
            if (foodErr) throw foodErr

            // Map old food id → new food id by (meal_id, order_index).
            // `meal_id` alone isn't unique enough for foods because a
            // meal can have multiple foods.
            const oldFoodKey = (f: { meal_id: string; order_index: number }) =>
              `${f.meal_id}::${f.order_index}`
            const newFoodKey = (f: { meal_id: string; order_index: number }) =>
              // The new food's meal_id is the *new* meal; reverse the
              // map to match against old keys.
              `${[...newMealByOldId.entries()].find(([, v]) => v === f.meal_id)?.[0] ?? ''}::${f.order_index}`
            const newFoodByOldId = new Map<string, string>()
            const oldFoodLookup = new Map<string, string>()
            for (const o of foodRows as Array<{ id: string; meal_id: string; order_index: number }>) {
              oldFoodLookup.set(oldFoodKey(o), o.id)
            }
            for (const n of (newFoodRows ?? []) as Array<{
              id: string
              meal_id: string
              order_index: number
            }>) {
              const oldId = oldFoodLookup.get(newFoodKey(n))
              if (oldId) newFoodByOldId.set(oldId, n.id)
            }

            // Best-effort: ingredients + food_alternatives.
            try {
              const { data: ingRows } = await supabase
                .from('ingredients')
                .select('*')
                .in('food_id', oldFoodIds)
              if (ingRows && ingRows.length > 0) {
                const ingPayload: Record<string, unknown>[] = []
                for (const ing of ingRows) {
                  const { id: _iid, created_at: _ica, food_id: oldFoodId, ...iRest } =
                    ing as { id: string; created_at?: string; food_id: string } & Record<string, unknown>
                  void _iid; void _ica
                  const newFoodId = newFoodByOldId.get(oldFoodId)
                  if (!newFoodId) continue
                  ingPayload.push({ ...iRest, food_id: newFoodId })
                }
                if (ingPayload.length > 0) {
                  await supabase.from('ingredients').insert(ingPayload)
                }
              }
            } catch {
              // ingredients table missing on older deploys — skip.
            }

            try {
              const { data: altRows } = await supabase
                .from('food_alternatives')
                .select('*')
                .in('food_id', oldFoodIds)
              if (altRows && altRows.length > 0) {
                const altPayload: Record<string, unknown>[] = []
                for (const a of altRows) {
                  const { id: _aid, created_at: _aca, food_id: oldFoodId, ...aRest } =
                    a as { id: string; created_at?: string; food_id: string } & Record<string, unknown>
                  void _aid; void _aca
                  const newFoodId = newFoodByOldId.get(oldFoodId)
                  if (!newFoodId) continue
                  altPayload.push({ ...aRest, food_id: newFoodId })
                }
                if (altPayload.length > 0) {
                  await supabase.from('food_alternatives').insert(altPayload)
                }
              }
            } catch {
              // food_alternatives table missing — skip.
            }
          }
        }
      }

      await fetchPlans()
      showToast('Meal plan duplicated')
    } catch {
      showToast('Failed to duplicate meal plan', 'error')
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
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Meal Plan Library</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Loading meal plans…</p>
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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Meal Plans</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
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
        <>
          {plans.length > 4 && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <LibrarySearch
                value={query}
                onChange={setQuery}
                placeholder="Search meal plans…"
              />
              <LibrarySort
                value={sortMode}
                onChange={setSortMode}
                className="sm:w-48"
              />
            </div>
          )}
          {visiblePlans.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic py-6 text-center">
              No meal plans match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visiblePlans.map(plan => (
            <div
              key={plan.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 transition-all hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h3>
                {plan.is_template && (
                  <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-full">
                    Template
                  </span>
                )}
              </div>
              {plan.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{plan.description}</p>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                {plan.meal_count} {plan.meal_count === 1 ? 'meal' : 'meals'}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setAssigningPlan(plan)} className="flex-1">
                  <Send size={14} />
                  Assign
                </Button>
                <IconButton
                  onClick={() => { setEditingPlan(plan); setShowBuilder(true) }}
                  aria-label="Edit meal plan"
                >
                  <Pencil size={16} />
                </IconButton>
                <IconButton
                  onClick={() => handleDuplicate(plan.id)}
                  aria-label="Duplicate meal plan"
                >
                  <Copy size={16} />
                </IconButton>
                <IconButton
                  tone="danger"
                  onClick={() => setDeletingId(plan.id)}
                  aria-label="Delete meal plan"
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>
          ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
