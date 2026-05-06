'use client'

import { Check } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'

interface MealLogToggleProps {
  assignmentId: string
  mealId: string
  userId: string
  loggedDate: string
  completed: boolean
  loaded: boolean
  // Parent owns the optimistic value so the whole-day summary updates instantly.
  onToggled: (next: boolean) => void
}

/**
 * Per-meal "I ate this" toggle. Mirrors the strength logger's done-button:
 * upsert on (assignment_id, meal_id, user_id, logged_date) with a `completed`
 * flag that flips on click. Optimistic; reverts on error.
 */
export function MealLogToggle({
  assignmentId,
  mealId,
  userId,
  loggedDate,
  completed,
  loaded,
  onToggled,
}: MealLogToggleProps) {
  const supabase = useSupabase()

  if (!loaded) {
    return <div className="h-7 w-7 bg-slate-200/70 rounded-md animate-pulse" />
  }

  const handleClick = async () => {
    const next = !completed
    onToggled(next)
    try {
      const { error } = await supabase
        .from('meal_logs')
        .upsert(
          {
            assignment_id: assignmentId,
            meal_id: mealId,
            user_id: userId,
            logged_date: loggedDate,
            completed: next,
          },
          { onConflict: 'meal_id,user_id,logged_date' }
        )
      if (error) throw error
    } catch {
      // Roll back the optimistic flip and surface the failure.
      onToggled(!next)
      showToast('Failed to update meal', 'error')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={completed ? 'Mark meal not eaten' : 'Mark meal eaten'}
      aria-pressed={completed}
      className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
        completed
          ? 'bg-emerald-500 border-emerald-500 text-white'
          : 'border-slate-300 text-transparent hover:border-slate-400'
      }`}
    >
      <Check size={14} />
    </button>
  )
}
