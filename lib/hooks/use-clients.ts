'use client'

// Coach's active client list.
//
// Used to be a single query that ran the relationships read and the
// `get_client_last_active_dates` RPC in parallel and waited for both
// before returning. That meant the slower RPC gated the first paint
// of the Clients screen, even though the roster (names + emails) is
// usually back in a fraction of the time.
//
// We now split into two queries:
//   • `useClientRoster` — fast, populates the cards.
//   • `useClientLastActiveDates` — slower, layers the "Active 2d ago"
//     pill onto each card once it lands.
//
// `useClients` is a thin composer that returns the roster and merges
// last-active timestamps as they arrive. Loading state tracks the
// roster only — the badge can lag without holding the page back.
//
// Cache keys: `queryKeys.clients.forCoach(coachId)` (roster) +
// `[...key, 'last_active']` (activity). The assignment-sync helper
// invalidates the roster key, which TanStack treats as a prefix match
// so both keys refresh together.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'
import { queryKeys } from '@/lib/query-keys'
import type { Client } from '@/lib/types'

interface RawClientRelationshipRow {
  started_at: string | null
  client: { id: string; full_name: string | null; email: string | null } | null
}

interface LastActiveRow {
  client_id: string
  last_active_date: string | null
}

export function useClientRoster(coachId: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.clients.forCoach(coachId),
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from('coach_client_relationships')
        .select('started_at, client:client_id ( id, full_name, email )')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .neq('client_id', coachId)
      if (error) throw error
      // PostgREST's nested-select type doesn't narrow well across versions;
      // cast at the boundary and filter rows where the join missed.
      const rows = (data ?? []) as unknown as RawClientRelationshipRow[]
      return rows
        .filter(
          (r): r is RawClientRelationshipRow & {
            client: NonNullable<RawClientRelationshipRow['client']>
          } => !!r.client
        )
        .map(r => ({
          id: r.client.id,
          // `Client` types both fields as non-null; profiles can legally
          // hold null for either column on freshly invited accounts.
          // Fall back to empty strings so the consumer never has to
          // null-check.
          full_name: r.client.full_name ?? '',
          email: r.client.email ?? '',
          started_at: r.started_at ?? undefined,
          // last_active_date is filled in by `useClients`'s composer.
          last_active_date: null,
        }))
    },
  })
}

export function useClientLastActiveDates(coachId: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: [...queryKeys.clients.forCoach(coachId), 'last_active'] as const,
    queryFn: async (): Promise<Map<string, string | null>> => {
      const { data, error } = await supabase.rpc('get_client_last_active_dates', {
        p_coach_id: coachId,
      })
      // RPC may fail on a legacy deployment that hasn't applied
      // migration 30. Empty map keeps the roster rendering.
      if (error || !Array.isArray(data)) return new Map()
      const out = new Map<string, string | null>()
      for (const r of data as LastActiveRow[]) {
        out.set(r.client_id, r.last_active_date)
      }
      return out
    },
  })
}

export function useClients(coachId: string) {
  const rosterQuery = useClientRoster(coachId)
  const activityQuery = useClientLastActiveDates(coachId)

  // Stitch last-active onto the roster as it arrives. Stable identity
  // via useMemo so downstream `.sort()` and selectors don't see a fresh
  // array on every render once both queries are quiet.
  const merged = useMemo(() => {
    const roster = rosterQuery.data
    if (!roster) return undefined
    const activity = activityQuery.data
    if (!activity) return roster
    return roster.map(c => ({
      ...c,
      last_active_date: activity.get(c.id) ?? null,
    }))
  }, [rosterQuery.data, activityQuery.data])

  // Return a query-like surface so existing consumers keep working
  // without changes. Loading reports roster only — the badge filling in
  // a beat later is acceptable; gating on it would defeat the split.
  return {
    data: merged,
    isLoading: rosterQuery.isLoading,
    isFetching: rosterQuery.isFetching || activityQuery.isFetching,
    isStale: rosterQuery.isStale || activityQuery.isStale,
    isSuccess: rosterQuery.isSuccess,
    error: rosterQuery.error,
  }
}
