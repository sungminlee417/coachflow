'use client'

// `body_measurements` read + save + delete.
//
// The query returns all measurements for a user sorted newest-first.
// Save handles both insert (no id) and update (with id); the cache is
// patched optimistically and reconciled with the server row on success.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'
import type { BodyMeasurement } from '@/lib/types'

function sortNewestFirst(a: BodyMeasurement, b: BodyMeasurement): number {
  const dateCmp = b.recorded_at.localeCompare(a.recorded_at)
  if (dateCmp !== 0) return dateCmp
  return (b.id ?? '').localeCompare(a.id ?? '')
}

export function useBodyMeasurements(userId: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.bodyMeasurements.list(userId),
    queryFn: async (): Promise<BodyMeasurement[]> => {
      const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BodyMeasurement[]
    },
  })
}

export function useSaveBodyMeasurement(userId: string) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const key = queryKeys.bodyMeasurements.list(userId)
  return useMutation({
    mutationKey: ['body_measurements.save', userId],
    mutationFn: async (measurement: BodyMeasurement) => {
      const payload = { ...measurement, user_id: userId } as Record<string, unknown>
      delete (payload as { id?: unknown }).id
      if (measurement.id) {
        const { data, error } = await supabase
          .from('body_measurements')
          .update(payload)
          .eq('id', measurement.id)
          .select()
          .single()
        if (error) throw error
        return data as BodyMeasurement
      }
      const { data, error } = await supabase
        .from('body_measurements')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as BodyMeasurement
    },
    onSuccess: row => {
      qc.setQueryData<BodyMeasurement[]>(key, current => {
        const list = (current ?? []).filter(m => m.id !== row.id)
        return [...list, row].sort(sortNewestFirst)
      })
    },
  })
}

export function useDeleteBodyMeasurement(userId: string) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const key = queryKeys.bodyMeasurements.list(userId)
  return useMutation({
    mutationKey: ['body_measurements.delete', userId],
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('body_measurements').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<BodyMeasurement[]>(key)
      qc.setQueryData<BodyMeasurement[]>(key, current =>
        (current ?? []).filter(m => m.id !== id)
      )
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
  })
}
