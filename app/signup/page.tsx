'use client'

import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Dumbbell, Mail, Lock, User } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

export default function SignupPage() {
  return (
    <Suspense>
      <Signup />
    </Suspense>
  )
}

function Signup() {
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('invite')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (inviteCode) {
        const { data: inviteData, error: inviteError } = await supabase
          .from('invite_codes')
          .select('*, coach_id')
          .eq('code', inviteCode)
          .single()

        if (inviteError || !inviteData) throw new Error('Invalid invite code')
        if (inviteData.status !== 'pending') throw new Error('This invite code has already been used')
        if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) throw new Error('This invite code has expired')
        if (inviteData.times_used >= inviteData.max_uses) throw new Error('This invite code has reached its maximum uses')
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })

      if (authError) throw authError

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({ id: authData.user.id, email, full_name: fullName })

        if (profileError) throw profileError

        if (inviteCode) {
          const { data: inviteData } = await supabase
            .from('invite_codes')
            .select('id, coach_id, times_used, max_uses')
            .eq('code', inviteCode)
            .single()

          if (inviteData) {
            const { error: relationshipError } = await supabase
              .from('coach_client_relationships')
              .insert({
                coach_id: inviteData.coach_id,
                client_id: authData.user.id,
                invite_code_id: inviteData.id,
              })

            if (relationshipError) throw relationshipError

            const newTimesUsed = inviteData.times_used + 1
            await supabase
              .from('invite_codes')
              .update({
                times_used: newTimesUsed,
                status: newTimesUsed >= inviteData.max_uses ? 'accepted' : 'pending',
              })
              .eq('id', inviteData.id)
          }
        }

        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 p-12 flex-col justify-between">
        <Link href="/" className="flex items-center gap-2.5 cursor-pointer">
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Dumbbell size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">CoachFlow</span>
        </Link>
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Start coaching<br />in minutes.
          </h2>
          <p className="text-indigo-200 text-lg">
            Create workouts, invite clients, track progress &mdash; all free.
          </p>
        </div>
        <p className="text-indigo-300 text-sm">&copy; {new Date().getFullYear()} CoachFlow</p>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 bg-slate-50">
        <div className="max-w-sm w-full">
          <div className="lg:hidden text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5 cursor-pointer">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Dumbbell size={16} className="text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900 tracking-tight">CoachFlow</span>
            </Link>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {inviteCode ? 'Join CoachFlow' : 'Create your account'}
          </h2>
          <p className="text-sm text-slate-500 mb-8">
            {inviteCode ? "You've been invited to join a coach" : 'Start your fitness journey today'}
          </p>

          <form className="space-y-4" onSubmit={handleSignup}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-400"
                  placeholder="Jane Smith"
                />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-400"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-slate-400"
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading || undefined}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading && <Spinner size={14} />}
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <p className="text-center text-sm text-slate-500 pt-2">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500 cursor-pointer">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
