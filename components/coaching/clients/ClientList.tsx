'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { ClientGridSkeleton } from '@/components/ui/Skeleton'
import { type LibrarySortMode } from '@/components/ui/LibrarySort'
import { LibraryFilterableGrid } from '@/components/ui/LibraryFilterableGrid'
import { UserPlus, ChevronRight, AlertTriangle } from 'lucide-react'
import { formatDate, todayISO, daysBetween } from '@/lib/utils'
import { useClients } from '@/lib/hooks/use-clients'
import type { Client } from '@/lib/types'
import ClientDetailView from './ClientDetailView'
import InviteCodeGenerator from './InviteCodeGenerator'

interface ClientListProps {
  coachId: string
}

// Mirror of the badge tones in the Tailwind theme. Each band has its own
// pill colour so a coach can scan the list and zero in on the at-risk
// clients without reading any text. Thresholds: today / 1–3d / 4–7d /
// 7d+. Past the 7-day band the badge flips to an `AlertTriangle` flag.
function describeLastSeen(
  lastActiveDate: string | null | undefined
): {
  label: string
  tone: 'emerald' | 'amber' | 'red' | 'muted'
  atRisk: boolean
} {
  if (!lastActiveDate) {
    return { label: 'No activity yet', tone: 'muted', atRisk: true }
  }
  // RPC may return either a date or a timestamptz; slice to YYYY-MM-DD
  // so `daysBetween` (which is pure date math) doesn't choke on the
  // trailing time component.
  const datePart = lastActiveDate.slice(0, 10)
  const days = daysBetween(datePart, todayISO())
  if (days <= 0) return { label: 'Active today', tone: 'emerald', atRisk: false }
  if (days === 1) return { label: 'Active yesterday', tone: 'emerald', atRisk: false }
  if (days <= 3) return { label: `Active ${days}d ago`, tone: 'amber', atRisk: false }
  if (days <= 7) return { label: `Active ${days}d ago`, tone: 'amber', atRisk: false }
  if (days <= 30) return { label: `${days}d quiet`, tone: 'red', atRisk: true }
  return { label: 'Inactive 30d+', tone: 'red', atRisk: true }
}

const TONE_CLASSES: Record<
  'emerald' | 'amber' | 'red' | 'muted',
  string
> = {
  emerald: 'bg-emerald-soft text-emerald-fg border-emerald-line',
  amber: 'bg-amber-soft text-amber-fg border-amber-line',
  red: 'bg-red-soft text-red-fg border-red-line',
  muted: 'bg-elevated text-muted border-line',
}

export default function ClientList({ coachId }: ClientListProps) {
  const clientsQuery = useClients(coachId)
  const clients = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data])
  // Mirror the today-card pattern: hold the skeleton while a refetch is
  // settling over a cached-empty list — otherwise the "No clients yet"
  // empty state can flash for coaches who actually have content.
  // `isFetching` covers the in-flight refetch; `isStale` covers the gap
  // between IndexedDB rehydration and the refetch actually starting —
  // without that, a stale-empty cache flashes "No clients yet" for a
  // frame on cold open.
  const loading =
    clientsQuery.isLoading ||
    (clients.length === 0 &&
      (clientsQuery.isFetching || clientsQuery.isStale))

  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showInvites, setShowInvites] = useState(false)
  const [query, setQuery] = useState('')
  // Templates don't apply here, so we expose only Recent + A→Z.
  const [sortMode, setSortMode] = useState<LibrarySortMode>('recent')

  const visibleClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? clients.filter(
          c =>
            (c.full_name ?? '').toLowerCase().includes(q) ||
            (c.email ?? '').toLowerCase().includes(q)
        )
      : clients
    // Inline sort: clients use `started_at` (when the relationship began),
    // not `created_at`, so the generic `sortLibrary` helper doesn't fit.
    const sorted = [...filtered]
    if (sortMode === 'alpha') {
      sorted.sort((a, b) =>
        (a.full_name ?? '').localeCompare(b.full_name ?? '', undefined, {
          sensitivity: 'base',
        })
      )
    } else {
      // 'recent' / 'template' both fall back to most-recent here.
      sorted.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    }
    return sorted
  }, [clients, query, sortMode])

  if (loading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Clients</h2>
            <p className="text-sm text-subtle mt-1">Loading clients…</p>
          </div>
        </div>
        <ClientGridSkeleton count={6} />
      </div>
    )
  }

  if (selectedClient) {
    return (
      <ClientDetailView
        client={selectedClient}
        coachId={coachId}
        onBack={() => setSelectedClient(null)}
      />
    )
  }

  if (showInvites) {
    return (
      <div>
        <button
          onClick={() => setShowInvites(false)}
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground mb-6 cursor-pointer"
        >
          ← Back to Clients
        </button>
        <InviteCodeGenerator coachId={coachId} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">My Clients</h2>
          <p className="text-sm text-muted mt-1">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        <Button onClick={() => setShowInvites(true)}>
          <UserPlus size={16} />
          Invite Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No clients yet"
          description="Generate an invite link to get started"
          action={
            <Button onClick={() => setShowInvites(true)}>
              <UserPlus size={16} />
              Invite Your First Client
            </Button>
          }
        />
      ) : (
        <LibraryFilterableGrid
          total={clients.length}
          visibleCount={visibleClients.length}
          query={query}
          onQueryChange={setQuery}
          sortMode={sortMode}
          onSortChange={setSortMode}
          searchPlaceholder="Search clients by name or email…"
          emptyMatchLabel="clients"
          // Templates aren't a concept for a relationship list.
          sortOptions={[
            { value: 'recent', label: 'Most recent' },
            { value: 'alpha', label: 'A → Z' },
          ]}
        >
              {visibleClients.map(client => {
                const seen = describeLastSeen(client.last_active_date)
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className={`bg-surface rounded-xl border p-5 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all text-left w-full cursor-pointer group ${
                      seen.atRisk
                        ? 'border-red-line/60 hover:border-red-line'
                        : 'border-line hover:border-indigo-line'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={client.full_name} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground truncate">{client.full_name}</h3>
                        <p className="text-sm text-muted truncate">{client.email}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-1.5 py-0.5 ${TONE_CLASSES[seen.tone]}`}
                          >
                            {seen.atRisk && <AlertTriangle size={10} />}
                            {seen.label}
                          </span>
                          {client.started_at && (
                            <span className="text-[10px] text-subtle">
                              · Joined {formatDate(client.started_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-faint group-hover:text-indigo-500 transition-colors shrink-0"
                      />
                    </div>
                  </button>
                )
              })}
        </LibraryFilterableGrid>
      )}
    </div>
  )
}
