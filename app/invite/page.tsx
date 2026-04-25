import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Dumbbell } from 'lucide-react'
import AcceptInvite from './AcceptInvite'

export const metadata: Metadata = {
  title: 'Accept Invite',
}

interface InvitePageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const { code } = await searchParams

  if (!code) {
    redirect('/')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in - let them choose to sign in or sign up
  if (!user) {
    // Get coach name for context
    const { data: invite } = await supabase
      .from('invite_codes')
      .select('coach_id, profiles:coach_id(full_name)')
      .eq('code', code)
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coachName = (invite?.profiles as any)?.full_name || 'a coach'

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-sm w-full mx-4 text-center">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Dumbbell size={16} className="text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900 tracking-tight">CoachFlow</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-2">You&apos;ve been invited</h2>
            <p className="text-slate-500 text-sm mb-8">
              <span className="font-medium text-slate-700">{coachName}</span> wants to coach you on CoachFlow.
            </p>

            <div className="space-y-3">
              <Link
                href={`/login?invite=${code}`}
                className="flex items-center justify-center w-full px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Sign in to accept
              </Link>
              <Link
                href={`/signup?invite=${code}`}
                className="flex items-center justify-center w-full px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Logged in - validate and accept the invite
  const { data: invite, error: inviteError } = await supabase
    .from('invite_codes')
    .select('id, coach_id, status, times_used, max_uses, expires_at')
    .eq('code', code)
    .single()

  if (inviteError || !invite) {
    return <AcceptInvite status="error" message="Invalid invite code." />
  }

  if (invite.status !== 'pending') {
    return <AcceptInvite status="error" message="This invite code has already been fully used." />
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return <AcceptInvite status="error" message="This invite code has expired." />
  }

  if (invite.times_used >= invite.max_uses) {
    return <AcceptInvite status="error" message="This invite code has reached its maximum uses." />
  }

  // Check if relationship already exists
  const { data: existing } = await supabase
    .from('coach_client_relationships')
    .select('id')
    .eq('coach_id', invite.coach_id)
    .eq('client_id', user.id)
    .single()

  if (existing) {
    return <AcceptInvite status="error" message="You're already connected to this coach." />
  }

  // Can't be your own client
  if (invite.coach_id === user.id) {
    return <AcceptInvite status="error" message="You can't accept your own invite code." />
  }

  // Create relationship
  const { error: relError } = await supabase
    .from('coach_client_relationships')
    .insert({
      coach_id: invite.coach_id,
      client_id: user.id,
      invite_code_id: invite.id,
    })

  if (relError) {
    return <AcceptInvite status="error" message="Something went wrong. Please try again." />
  }

  // Update invite code usage
  const newTimesUsed = invite.times_used + 1
  await supabase
    .from('invite_codes')
    .update({
      times_used: newTimesUsed,
      status: newTimesUsed >= invite.max_uses ? 'accepted' : 'pending',
    })
    .eq('id', invite.id)

  // Get coach name for the success message
  const { data: coachProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', invite.coach_id)
    .single()

  return <AcceptInvite status="success" message={`You're now connected to ${coachProfile?.full_name || 'your coach'}!`} />
}
