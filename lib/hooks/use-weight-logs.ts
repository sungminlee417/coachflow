'use client'

// `weight_logs` read + log + delete. The query returns the user's most
// recent 30 entries sorted newest-first — enough for the chart, history
// strip, and Today's "Last weighed" tile to all share one cache.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'
import type { WeightLog } from '@/lib/types'

const RECENT_LIMIT = 30

export function useWeightLogs(userId: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.weightLogs.list(userId),
    queryFn: async (): Promise<WeightLog[]> => {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(RECENT_LIMIT)
      if (error) throw error
      return (data ?? []) as WeightLog[]
    },
  })
}

interface LogArgs {
  recorded_at: string
  weight: number
  /** Optional BF% tag-along. `undefined` means "don't touch the column"
   *  on upsert (preserves a prior value when the user only updates the
   *  weight); `null` would actively clear it — callers pass either as
   *  needed. */
  body_fat_percent?: number | null
}

export function useLogWeight(userId: string) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const key = queryKeys.weightLogs.list(userId)
  return useMutation({
    mutationKey: ['weight_logs.log', userId],
    mutationFn: async ({ recorded_at, weight, body_fat_percent }: LogArgs) => {
      const payload: Record<string, unknown> = {
        user_id: userId,
        recorded_at,
        weight,
      }
      // Only include BF% in the payload when the caller actually
      // supplied one. Omitting the field on upsert leaves any existing
      // value alone, which is what the Today quick-logger wants when
      // the user just updates their weight for a day they already
      // tagged a BF% on.
      if (body_fat_percent !== undefined) {
        payload.body_fat_percent = body_fat_percent
      }
      const { data, error } = await supabase
        .from('weight_logs')
        .upsert(payload, { onConflict: 'user_id,recorded_at' })
        .select()
        .single()
      if (error) throw error
      return data as WeightLog
    },
    onMutate: async ({ recorded_at, weight, body_fat_percent }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WeightLog[]>(key)
      // Optimistic: replace any entry for the same date, then prepend.
      // When BF% wasn't supplied, carry the existing entry's value
      // forward so the optimistic row matches what the server will
      // return after the no-op-on-that-column upsert.
      const existingForDate = (prev ?? []).find(l => l.recorded_at === recorded_at)
      const optimisticBfp =
        body_fat_percent === undefined
          ? existingForDate?.body_fat_percent ?? null
          : body_fat_percent
      qc.setQueryData<WeightLog[]>(key, current => {
        const list = (current ?? []).filter(l => l.recorded_at !== recorded_at)
        const optimistic: WeightLog = {
          // Use a synthetic id; replaced on success via `onSuccess` below.
          id: `optimistic-${recorded_at}`,
          user_id: userId,
          recorded_at,
          weight,
          body_fat_percent: optimisticBfp,
          notes: null,
        }
        return [optimistic, ...list].slice(0, RECENT_LIMIT)
      })
      return { prev }
    },
    onSuccess: row => {
      qc.setQueryData<WeightLog[]>(key, current => {
        const filtered = (current ?? []).filter(
          l => l.recorded_at !== row.recorded_at && l.id !== row.id
        )
        return [row, ...filtered].slice(0, RECENT_LIMIT)
      })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
  })
}

export function useDeleteWeightLog(userId: string) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const key = queryKeys.weightLogs.list(userId)
  return useMutation({
    mutationKey: ['weight_logs.delete', userId],
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('weight_logs').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WeightLog[]>(key)
      qc.setQueryData<WeightLog[]>(key, current =>
        (current ?? []).filter(l => l.id !== id)
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
  })
}
