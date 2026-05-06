'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { UserPlus, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Client } from '@/lib/types'
import ClientDetailView from './ClientDetailView'
import InviteCodeGenerator from './InviteCodeGenerator'

interface ClientListProps {
  coachId: string
}

export default function ClientList({ coachId }: ClientListProps) {
  const supabase = useSupabase()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showInvites, setShowInvites] = useState(false)

  useEffect(() => {
    fetchClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('coach_client_relationships')
        .select('started_at, client:client_id ( id, full_name, email )')
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .neq('client_id', coachId)

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformed: Client[] = (data || []).map((item: any) => ({
        id: item.client.id,
        full_name: item.client.full_name,
        email: item.client.email,
        started_at: item.started_at,
      }))
      setClients(transformed)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Clients</h2>
            <p className="text-sm text-slate-400 mt-1">Loading clients…</p>
          </div>
        </div>
        <ListSkeleton count={4} />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(client => (
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
                  className="text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0"
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
