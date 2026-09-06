'use client'

// `water_logs` read + increment.
//
// One row per (user, day). Increments accumulate throughout the day via
// a server-side atomic RPC (`log_water_delta`) so a rapid burst of quick
// -add taps — or a flaky network that retries mid-flight — can't lose an
// increment via client-side read-modify-write. Undo passes a negative
// delta; the RPC clamps the result at 0.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'
import type { WaterLog } from '@/lib/types'

export function useWaterLog(userId: string, date: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.waterLogs.forDay(userId, date),
    queryFn: async (): Promise<WaterLog | null> => {
      const { data, error } = await supabase
        .from('water_logs')
        .select('id, user_id, logged_date, amount_ml')
        .eq('user_id', userId)
        .eq('logged_date', date)
        .maybeSingle()
      if (error) throw error
      return (data as WaterLog | null) ?? null
    },
  })
}

interface DeltaArgs {
  date: string
  /** Positive to add, negative to undo. RPC clamps below 0. */
  delta_ml: number
}

export function useLogWaterDelta(userId: string) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['water_logs.delta', userId],
    // Serialize increments for the same user so onMutate's optimistic
    // patch stays consistent with the server-side atomic addition — a
    // burst of taps queues instead of racing.
    scope: { id: `water_logs.delta.${userId}` },
    mutationFn: async ({ date, delta_ml }: DeltaArgs): Promise<number> => {
      const { data, error } = await supabase.rpc('log_water_delta', {
        p_date: date,
        p_delta_ml: delta_ml,
      })
      if (error) throw error
      return typeof data === 'number' ? data : 0
    },
    onMutate: async ({ date, delta_ml }) => {
      const key = queryKeys.waterLogs.forDay(userId, date)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WaterLog | null>(key)
      const prevAmount = prev?.amount_ml ?? 0
      const nextAmount = Math.max(0, prevAmount + delta_ml)
      qc.setQueryData<WaterLog | null>(key, {
        id: prev?.id,
        user_id: userId,
        logged_date: date,
        amount_ml: nextAmount,
      })
      return { prev, key }
    },
    onSuccess: (newAmount, { date }) => {
      const key = queryKeys.waterLogs.forDay(userId, date)
      qc.setQueryData<WaterLog | null>(key, current => ({
        id: current?.id,
        user_id: userId,
        logged_date: date,
        amount_ml: newAmount,
      }))
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev ?? null)
    },
  })
}
