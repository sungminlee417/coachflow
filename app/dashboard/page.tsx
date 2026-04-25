import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UnifiedDashboard from '@/components/UnifiedDashboard'
import ProfileNotFound from '@/components/ProfileNotFound'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default async function Dashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return <ProfileNotFound error={profileError?.message} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UnifiedDashboard user={user} profile={profile} />
    </div>
  )
}
