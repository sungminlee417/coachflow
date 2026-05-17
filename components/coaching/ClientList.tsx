'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { ClientGridSkeleton } from '@/components/ui/Skeleton'
import { LibrarySearch } from '@/components/ui/LibrarySearch'
import { LibrarySort, type LibrarySortMode } from '@/components/ui/LibrarySort'
import { UserPlus, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useClients } from '@/lib/hooks/use-clients'
import type { Client } from '@/lib/types'
import ClientDetailView from './ClientDetailView'
import InviteCodeGenerator from './InviteCodeGenerator'

interface ClientListProps {
  coachId: string
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
            <h2 className="text-2xl font-bold text-slate-900">Clients</h2>
            <p className="text-sm text-slate-400 mt-1">Loading clients…</p>
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
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6 cursor-pointer"
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
          <h2 className="text-2xl font-bold text-slate-900">My Clients</h2>
          <p className="text-sm text-slate-500 mt-1">
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
        <>
          {clients.length > 4 && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <LibrarySearch
                value={query}
                onChange={setQuery}
                placeholder="Search clients by name or email…"
              />
              <LibrarySort
                value={sortMode}
                onChange={setSortMode}
                // Templates aren't a concept for a relationship list.
                options={[
                  { value: 'recent', label: 'Most recent' },
                  { value: 'alpha', label: 'A → Z' },
                ]}
                className="sm:w-48"
              />
            </div>
          )}
          {visibleClients.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-6 text-center">
              No clients match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleClients.map(client => (
            <button
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all text-left w-full cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <Avatar name={client.full_name} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-900 truncate">{client.full_name}</h3>
                  <p className="text-sm text-slate-500 truncate">{client.email}</p>
                  {client.started_at && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Joined {formatDate(client.started_at)}
                    </p>
                  )}
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0"
                />
              </div>
            </button>
          ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
