'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface InviteCode {
  id: string
  code: string
  status: string
  max_uses: number
  times_used: number
  expires_at: string | null
  created_at: string
}

interface InviteCodeGeneratorProps {
  coachId: string
}

export default function InviteCodeGenerator({ coachId }: InviteCodeGeneratorProps) {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchInviteCodes()
  }, [])

  const fetchInviteCodes = async () => {
    try {
      const { data, error } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setInviteCodes(data || [])
    } catch (error) {
      console.error('Error fetching invite codes:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateInviteCode = async () => {
    setGenerating(true)
    try {
      // Generate a random 8-character code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase()

      const { error } = await supabase
        .from('invite_codes')
        .insert({
          coach_id: coachId,
          code: code,
          max_uses: 1,
          status: 'pending',
        })

      if (error) throw error

      await fetchInviteCodes()
    } catch (error) {
      console.error('Error generating invite code:', error)
      alert('Failed to generate invite code')
    } finally {
      setGenerating(false)
    }
  }

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/signup?invite=${code}`
    navigator.clipboard.writeText(link)
    alert('Invite link copied to clipboard!')
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invite Codes</h2>
          <p className="text-gray-600 mt-1">Generate invite codes to connect with new clients</p>
        </div>
        <button
          onClick={generateInviteCode}
          disabled={generating}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? 'Generating...' : 'Generate New Code'}
        </button>
      </div>

      {inviteCodes.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">No invite codes yet. Generate one to get started!</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {inviteCodes.map((invite) => (
                <tr key={invite.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                      {invite.code}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        invite.status === 'pending'
                          ? 'bg-green-100 text-green-800'
                          : invite.status === 'accepted'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {invite.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {invite.times_used} / {invite.max_uses}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(invite.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {invite.status === 'pending' && invite.times_used < invite.max_uses && (
                      <button
                        onClick={() => copyInviteLink(invite.code)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Copy Link
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
