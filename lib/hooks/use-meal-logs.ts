'use client'

// `meal_logs` read + toggle.
//
// Shape of one row we care about: { meal_id, completed }. We model the
// query's cached value as a `Set<string>` of eaten meal_ids for a given
// (clientId, date) — it's what every consumer actually wants. The
// mutation flips one meal's eaten flag, optimistically updating the
// cached Set so the UI is instant.

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'

interface ToggleArgs {
  assignmentId: string
  mealId: string
  completed: boolean
}

interface UseMealLogsArgs {
  clientId: string
  date: string
}

export function useMealLogs({ clientId, date }: UseMealLogsArgs) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.mealLogs.forDay(clientId, date),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('meal_id, completed')
        .eq('user_id', clientId)
        .eq('logged_date', date)
      if (error) throw error
      const out = new Set<string>()
      for (const r of (data ?? []) as Array<{ meal_id: string; completed: boolean }>) {
        if (r.completed) out.add(r.meal_id)
      }
      return out
    },
  })
}

export function useToggleMealLog({ clientId, date }: UseMealLogsArgs) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const key = queryKeys.mealLogs.forDay(clientId, date)
  return useMutation({
    // Stable mutationKey so the persister can dedupe interrupted writes
    // and `resumePausedMutations` finds them on reload.
    mutationKey: ['meal_logs.toggle', clientId, date],
    mutationFn: async ({ assignmentId, mealId, completed }: ToggleArgs) => {
      const { error } = await supabase
        .from('meal_logs')
        .upsert(
          {
            assignment_id: assignmentId,
            meal_id: mealId,
            user_id: clientId,
            logged_date: date,
            completed,
          },
          { onConflict: 'meal_id,user_id,logged_date' }
        )
      if (error) throw error
    },
    // Optimistic: flip the cached Set immediately so every subscriber
    // re-renders without waiting for the server.
    onMutate: async ({ mealId, completed }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Set<string>>(key)
      qc.setQueryData<Set<string>>(key, current => {
        const next = new Set(current ?? [])
        if (completed) next.add(mealId)
        else next.delete(mealId)
        return next
      })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
  })
}
