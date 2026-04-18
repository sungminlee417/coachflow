'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from './Toast'
import { X } from 'lucide-react'

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
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleAssign = async () => {
    if (!selectedClientId) {
      showToast('Please select a client', 'error')
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

      showToast('Workout assigned successfully!')
      onClose()
    } catch {
      showToast('Failed to assign workout', 'error')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900">Assign Workout</h2>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mb-5 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
            <p className="text-sm text-indigo-700 font-medium">{workoutName}</p>
          </div>

          {loading ? (
            <div className="text-slate-400 text-sm py-8 text-center">Loading clients...</div>
          ) : clients.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-1">No clients yet</p>
              <p className="text-sm text-slate-400">Generate an invite code to add clients first.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="wa-client" className="block text-sm font-medium text-slate-700 mb-1">
                  Client
                </label>
                <select
                  id="wa-client"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
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
                <label htmlFor="wa-date" className="block text-sm font-medium text-slate-700 mb-1">
                  Date
                </label>
                <input
                  id="wa-date"
                  type="date"
                  value={assignedDate}
                  onChange={(e) => setAssignedDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label htmlFor="wa-notes" className="block text-sm font-medium text-slate-700 mb-1">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="wa-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any specific instructions..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAssign}
                  disabled={assigning || !selectedClientId}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors cursor-pointer"
                >
                  {assigning ? 'Assigning...' : 'Assign Workout'}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors cursor-pointer"
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
