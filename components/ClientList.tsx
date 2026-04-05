'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ClientDetailView from './ClientDetailView'

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

      // Transform the data
      const transformedClients = data?.map((item: any) => ({
        id: item.client.id,
        full_name: item.client.full_name,
        email: item.client.email,
        started_at: item.started_at,
      })) || []

      setClients(transformedClients)
    } catch (error) {
      console.error('Error fetching clients:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>Loading...</div>
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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">My Clients</h2>
        <p className="text-gray-600 mt-1">
          {clients.length} {clients.length === 1 ? 'client' : 'clients'}
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-4">You don't have any clients yet.</p>
          <p className="text-sm text-gray-600">Generate an invite code to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => (
            <button
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow text-left w-full"
            >
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-lg font-bold">
                  {client.full_name?.charAt(0) || 'C'}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">{client.full_name}</h3>
                  <p className="text-sm text-gray-600">{client.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Joined {new Date(client.started_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-gray-400">→</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
