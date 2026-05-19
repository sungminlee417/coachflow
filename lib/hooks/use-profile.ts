'use client'

// Profile read + preference-patch hooks.
//
// The dashboard page already loads the profile server-side and prop-
// drills it for static reads (name, units). This hook owns the *live*
// copy that Settings writes through, plus the readers for toggles that
// need to react to changes without a full page reload (rest timer,
// streak card visibility).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import type { Profile } from '@/lib/types'

const profileKey = (userId: string) => ['profile', userId] as const

export function useProfile(userId: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: profileKey(userId),
    // Skip the round-trip if the caller hasn't resolved a user yet.
    enabled: userId.length > 0,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) throw error
      return data as Profile
    },
  })
}

type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'rest_timer_enabled'
    | 'show_streak_card'
    | 'full_name'
    | 'weight_unit'
    | 'length_unit'
    | 'theme'
  >
>

export function useUpdateProfile(userId: string) {
  const supabase = useSupabase()
  const qc = useQueryClient()
  const key = profileKey(userId)
  return useMutation({
    mutationKey: ['profile.update', userId],
    mutationFn: async (patch: ProfilePatch) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select()
        .single()
      if (error) throw error
      return data as Profile
    },
    onMutate: async patch => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Profile>(key)
      if (prev) qc.setQueryData<Profile>(key, { ...prev, ...patch })
      return { prev }
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSuccess: row => {
      qc.setQueryData<Profile>(key, row)
    },
  })
}
