'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardGridSkeleton } from '@/components/ui/Skeleton'
import { Plus, Send, Pencil, Trash2, Apple } from 'lucide-react'
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
            <h2 className="text-2xl font-bold text-slate-900">Meal Plan Library</h2>
            <p className="text-sm text-slate-400 mt-1">Loading meal plans…</p>
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
          <h2 className="text-2xl font-bold text-slate-900">Meal Plans</h2>
          <p className="text-sm text-slate-500 mt-1">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <div
              key={plan.id}
              className="bg-white rounded-xl border border-slate-200 p-5 transition-all hover:border-emerald-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                {plan.is_template && (
                  <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-50 text-purple-600 border border-purple-200 rounded-full">
                    Template
                  </span>
                )}
              </div>
              {plan.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{plan.description}</p>
              )}
              <p className="text-xs text-slate-400 mb-4">
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
    </div>
  )
}
