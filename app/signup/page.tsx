'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type UserRole = 'coach' | 'client'

export default function Signup() {
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('invite')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>(inviteCode ? 'client' : 'coach')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  
  const handleSignup = async (e: React.FormEvent) => {
    console.log("FORM SUBMITTED") // testing 1.
    e.preventDefault()
    setError(null)
    setLoading(true)
    console.log("ROLE (before check):", role) // testing 2
    console.log("INVITE CODE (before check):", inviteCode) // testing 3
    try {
      // If invite code is present, validate it first
      if (inviteCode && role === 'client') {
        const { data: inviteData, error: inviteError } = await supabase
          .from('invite_codes')
          .select('*, coach_id')
          .eq('code', inviteCode)
          .single()

        if (inviteError || !inviteData) {
          throw new Error('Invalid invite code')
        }

        if (inviteData.status !== 'pending') {
          throw new Error('This invite code has already been used')
        }

        if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
          throw new Error('This invite code has expired')
        }

        if (inviteData.times_used >= inviteData.max_uses) {
          throw new Error('This invite code has reached its maximum uses')
        }
      }

      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
        },
      })

      if (authError) throw authError

      if (authData.user) {
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: email,
            full_name: fullName,
            role: role,
          })

        if (profileError) throw profileError

        // If coach, create coach_profile
        if (role === 'coach') {
          const { error: coachProfileError } = await supabase
            .from('coach_profiles')
            .insert({
              id: authData.user.id,
            })

          if (coachProfileError) throw coachProfileError
        }

        // If client with invite code, create relationship
        if (role === 'client' && inviteCode) {
          const { data: inviteData } = await supabase
            .from('invite_codes')
            .select('id, coach_id, times_used, max_uses')
            .eq('code', inviteCode)
            .single()

          if (inviteData) {
            // Create coach-client relationship
            const { error: relationshipError } = await supabase
              .from('coach_client_relationships')
              .insert({
                coach_id: inviteData.coach_id,
                client_id: authData.user.id,
                invite_code_id: inviteData.id,
              })

            if (relationshipError) throw relationshipError

            // Update invite code usage
           const { error:rpcError } = await supabase.rpc('use_invite', {
            code: inviteCode
           })
           if (rpcError) {
            console.error("RPC invite update failed:", rpcError)
            throw rpcError
           }
          }
        }

        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-gray-900">
            CoachFlow
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div>
            <h2 className="text-center text-3xl font-bold text-gray-900">
              {inviteCode ? 'Join CoachFlow' : 'Create your account'}
            </h2>
            {inviteCode ? (
              <p className="mt-2 text-center text-sm text-gray-600">
                You've been invited to join as a client
              </p>
            ) : (
              <p className="mt-2 text-center text-sm text-gray-600">
                Start your fitness coaching journey today
              </p>
            )}
          </div>
        <form className="mt-8 space-y-6" onSubmit={handleSignup}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {!inviteCode && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  I am a...
                </label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="role"
                      value="coach"
                      checked={role === 'coach'}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">Coach</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="role"
                      value="client"
                      checked={role === 'client'}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">Client</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Sign up'}
            </button>
          </div>

          <div className="text-center text-sm">
            <span className="text-gray-600">Already have an account? </span>
            <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}
