'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

interface ClientDashboardProps {
  user: User
  profile: any
}

export default function ClientDashboard({ user, profile }: ClientDashboardProps) {
  const [coach, setCoach] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchCoach()
  }, [])

  const fetchCoach = async () => {
    try {
      // Get coach relationship
      const { data: relationship } = await supabase
        .from('coach_client_relationships')
        .select('coach_id, profiles(*)')
        .eq('client_id', user.id)
        .eq('status', 'active')
        .single()

      if (relationship) {
        setCoach(relationship.profiles)
      }
    } catch (error) {
      console.error('Error fetching coach:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CoachFlow</h1>
              <p className="text-sm text-gray-600">Welcome back, {profile.full_name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Your Coach</h2>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : coach ? (
            <div>
              <div className="flex items-center space-x-4">
                <div className="h-16 w-16 bg-blue-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                  {coach.full_name?.charAt(0) || 'C'}
                </div>
                <div>
                  <h3 className="text-lg font-medium">{coach.full_name}</h3>
                  <p className="text-gray-600">{coach.email}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">You're not connected to a coach yet.</p>
              <p className="text-sm text-gray-600">Ask your coach for an invite link to get started.</p>
            </div>
          )}
        </div>

        {/* Placeholder for future features */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Today's Workout</h3>
            <p className="text-gray-500">No workouts assigned yet</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Today's Meal Plan</h3>
            <p className="text-gray-500">No meal plan assigned yet</p>
          </div>
        </div>
      </div>
    </div>
  )
}
