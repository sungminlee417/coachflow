'use client'

// Coach's active client list. Reads `coach_client_relationships` joined
// with the `profiles` row for each client. Filters out the coach's own
// id (every coach is auto-related to themselves so self-coaching works
// without a separate code path).
//
// Cache key lives at `queryKeys.clients.forCoach(coachId)` so the invite
// acceptance flow (or any other future relationship mutation) can
// invalidate it directly.
//
// We also call `get_client_last_active_dates` in parallel to stitch a
// "last seen" timestamp onto each row. That powers the activity badge
// on the Clients screen so a coach can spot quiet trainees at a glance.

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

export function useClients(coachId: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: queryKeys.clients.forCoach(coachId),
    queryFn: async (): Promise<Client[]> => {
      const [relsResult, lastActiveResult] = await Promise.all([
        supabase
          .from('coach_client_relationships')
          .select('started_at, client:client_id ( id, full_name, email )')
          .eq('coach_id', coachId)
          .eq('status', 'active')
          .neq('client_id', coachId),
        // RPC may fail (e.g. legacy deployment without migration 30) —
        // fall back to an empty map rather than blowing up the list.
        supabase.rpc('get_client_last_active_dates', { p_coach_id: coachId }),
      ])
      if (relsResult.error) throw relsResult.error

      const lastActiveMap = new Map<string, string | null>()
      if (!lastActiveResult.error && Array.isArray(lastActiveResult.data)) {
        for (const r of lastActiveResult.data as LastActiveRow[]) {
          lastActiveMap.set(r.client_id, r.last_active_date)
        }
      }

      // PostgREST's nested-select type doesn't narrow well across versions;
      // cast at the boundary and filter rows where the join missed.
      const rows = (relsResult.data ?? []) as unknown as RawClientRelationshipRow[]
      return rows
        .filter((r): r is RawClientRelationshipRow & { client: NonNullable<RawClientRelationshipRow['client']> } => !!r.client)
        .map(r => ({
          id: r.client.id,
          // `Client` types both fields as non-null; profiles can legally
          // hold null for either column on freshly invited accounts. Fall
          // back to empty strings so the consumer never has to null-check.
          full_name: r.client.full_name ?? '',
          email: r.client.email ?? '',
          started_at: r.started_at ?? undefined,
          last_active_date: lastActiveMap.get(r.client.id) ?? null,
        }))
    },
  })
}
