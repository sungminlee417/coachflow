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
      <div className="min-h-screen flex items-center justify-center bg-elevated">
        <div className="max-w-sm w-full mx-4 text-center">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Dumbbell size={16} className="text-white" />
              </div>
              <span className="text-lg font-bold text-foreground tracking-tight">CoachFlow</span>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-line shadow-sm p-8">
            <h2 className="text-xl font-bold text-foreground mb-2">You&apos;ve been invited</h2>
            <p className="text-muted text-sm mb-8">
              <span className="font-medium text-foreground">{coachName}</span> wants to coach you on CoachFlow.
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
                className="flex items-center justify-center w-full px-4 py-2.5 border border-line text-foreground rounded-xl text-sm font-semibold hover:bg-elevated transition-colors cursor-pointer"
              >
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Logged in — atomically validate + create the relationship + bump
  // the invite counter via a single SECURITY DEFINER RPC. Migration 28
  // introduced this; before that the page did the steps inline and
  // relied on an overly-permissive UPDATE policy on `invite_codes` that
  // Supabase's advisor flagged.
  const { data: result, error: rpcError } = await supabase.rpc('use_invite', {
    code,
  })

  if (rpcError || !result) {
    return <AcceptInvite status="error" message="Something went wrong. Please try again." />
  }

  const { status, coach_name } = result as {
    status:
      | 'ok'
      | 'invalid'
      | 'revoked'
      | 'expired'
      | 'fully_used'
      | 'already_connected'
      | 'self_code'
      | 'unauthenticated'
    coach_name?: string
  }

  switch (status) {
    case 'ok':
      return (
        <AcceptInvite
          status="success"
          message={`You're now connected to ${coach_name || 'your coach'}!`}
        />
      )
    case 'invalid':
      return <AcceptInvite status="error" message="Invalid invite code." />
    case 'revoked':
      return <AcceptInvite status="error" message="This invite code has been revoked by the coach." />
    case 'expired':
      return <AcceptInvite status="error" message="This invite code has expired." />
    case 'fully_used':
      return <AcceptInvite status="error" message="This invite code has reached its maximum uses." />
    case 'already_connected':
      return <AcceptInvite status="error" message="You're already connected to this coach." />
    case 'self_code':
      return <AcceptInvite status="error" message="You can't accept your own invite code." />
    case 'unauthenticated':
      // The branch above redirected when there was no `user`, so this
      // should be unreachable — but a stale token could theoretically
      // pass the cookie check and still fail the RPC. Treat as a
      // generic error rather than crashing the page.
      return <AcceptInvite status="error" message="Please sign in and try again." />
  }
}
