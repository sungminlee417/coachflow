'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Client {
  id: string
  full_name: string
  email: string
}

interface WorkoutAssignmentProps {
  coachId: string
  workoutId: string
  workoutName: string
  onClose: () => void
}

export default function WorkoutAssignment({ coachId, workoutId, workoutName, onClose }: WorkoutAssignmentProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [assignedDate, setAssignedDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('coach_client_relationships')
        .select(`
          client:client_id (
            id,
            full_name,
            email
          )
        `)
        .eq('coach_id', coachId)
        .eq('status', 'active')

      if (error) throw error

      const clientList = data?.map((item: any) => item.client).filter(Boolean) || []
      setClients(clientList)
    } catch (error) {
      console.error('Error fetching clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedClientId) {
      alert('Please select a client')
      return
    }

    setAssigning(true)
    try {
      const { error } = await supabase
        .from('workout_assignments')
        .insert({
          workout_id: workoutId,
          client_id: selectedClientId,
          coach_id: coachId,
          assigned_date: assignedDate,
          notes: notes
        })

      if (error) throw error

      alert('Workout assigned successfully!')
      onClose()
    } catch (error) {
      console.error('Error assigning workout:', error)
      alert('Failed to assign workout')
    } finally {
      setAssigning(false)
    }
  }

  if (loading) {
    return <div className="p-6">Loading clients...</div>
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Assign Workout</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="mb-4 p-3 bg-blue-50 rounded">
            <p className="text-sm text-blue-900 font-medium">{workoutName}</p>
          </div>

          {clients.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">You don't have any clients yet.</p>
              <p className="text-sm text-gray-600">Generate an invite code to add clients first.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Client *
                </label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Choose a client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.full_name} ({client.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={assignedDate}
                  onChange={(e) => setAssignedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any specific instructions..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAssign}
                  disabled={assigning || !selectedClientId}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigning ? 'Assigning...' : 'Assign Workout'}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
