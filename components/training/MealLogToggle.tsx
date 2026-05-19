'use client'

import { Check } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'
import { useMealLogs, useToggleMealLog } from '@/lib/hooks/use-meal-logs'

interface MealLogToggleProps {
  assignmentId: string
  mealId: string
  userId: string
  loggedDate: string
}

/**
 * Per-meal "I ate this" toggle. Reads the eaten set from the TanStack
 * Query cache and toggles via a mutation with optimistic update +
 * rollback. The mutation's stable `mutationKey` means a write
 * interrupted by a page reload resumes on next mount.
 */
export function MealLogToggle({
  assignmentId,
  mealId,
  userId,
  loggedDate,
}: MealLogToggleProps) {
  const eaten = useMealLogs({ clientId: userId, date: loggedDate })
  const toggle = useToggleMealLog({ clientId: userId, date: loggedDate })

  if (!eaten.isSuccess && eaten.isLoading) {
    return <div className="h-7 w-7 bg-slate-200/70 rounded-md animate-pulse" />
  }
  const completed = eaten.data?.has(mealId) ?? false

  const handleClick = () => {
    toggle.mutate(
      { assignmentId, mealId, completed: !completed },
      {
        onError: () => showToast('Failed to update meal', 'error'),
      }
    )
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
          : 'border-slate-300 dark:border-slate-600 text-transparent hover:border-slate-400'
      }`}
    >
      <Check size={14} />
    </button>
  )
}
