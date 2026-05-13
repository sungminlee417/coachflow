'use client'

import { Check } from 'lucide-react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { queuedUpsert } from '@/lib/write-queue'

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
    const { error } = await queuedUpsert(
      supabase,
      'meal_logs',
      {
        assignment_id: assignmentId,
        meal_id: mealId,
        user_id: userId,
        logged_date: loggedDate,
        completed: next,
      },
      { onConflict: 'meal_id,user_id,logged_date' }
    )
    if (error) {
      // Real error (not "we queued it"). Roll back the optimistic flip.
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
