import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UnifiedDashboard from '@/components/dashboard/UnifiedDashboard'
import type { Profile } from '@/lib/types'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get profile, or create one if missing (defensive: signup should have created it).
  // `.maybeSingle()` returns null cleanly when the profile doesn't exist yet —
  // `.single()` would throw, which is wasted work on a happy-path code branch
  // that already handles the null case explicitly below.
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    const { data: created } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? user.email ?? 'User',
      })
      .select()
      .single()
    profile = created
  }

  if (!profile) redirect('/login')

  // Ensure self-coaching relationship exists so the user can coach themselves.
  // Idempotent: ON CONFLICT does nothing if the row already exists.
  await supabase
    .from('coach_client_relationships')
    .upsert(
      {
        coach_id: user.id,
        client_id: user.id,
        status: 'active',
      },
      { onConflict: 'coach_id,client_id', ignoreDuplicates: true }
    )

  return (
    <div className="min-h-screen bg-elevated">
      <UnifiedDashboard user={user} profile={profile as Profile} />
    </div>
  )
}
