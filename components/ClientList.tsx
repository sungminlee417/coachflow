'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, ChevronRight } from 'lucide-react'
import ClientDetailView from './ClientDetailView'
import InviteCodeGenerator from './InviteCodeGenerator'

interface Client {
  id: string
  full_name: string
  email: string
  started_at: string
}

interface ClientListProps {
  coachId: string
}

export default function ClientList({ coachId }: ClientListProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showInvites, setShowInvites] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('coach_client_relationships')
        .select(`
          started_at,
          client:client_id (
            id,
            full_name,
            email
          )
        `)
        .eq('coach_id', coachId)
        .eq('status', 'active')

      if (error) throw error

      const transformedClients = data?.map((item: any) => ({
        id: item.client.id,
        full_name: item.client.full_name,
        email: item.client.email,
        started_at: item.started_at,
      })) || []

      setClients(transformedClients)
    } catch {
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>
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
          &larr; Back to Clients
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
        <button
          onClick={() => setShowInvites(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors cursor-pointer"
        >
          <UserPlus size={16} />
          Invite Client
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus size={20} className="text-slate-400" />
          </div>
          <p className="text-slate-500 mb-1">No clients yet</p>
          <p className="text-sm text-slate-400 mb-5">Generate an invite link to get started</p>
          <button
            onClick={() => setShowInvites(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors cursor-pointer"
          >
            <UserPlus size={16} />
            Invite Your First Client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <button
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-md transition-all text-left w-full cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {client.full_name?.charAt(0) || 'C'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-900 truncate">{client.full_name}</h3>
                  <p className="text-sm text-slate-500 truncate">{client.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Joined {new Date(client.started_at).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
