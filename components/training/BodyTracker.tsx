'use client'

import { useState } from 'react'
import WeightTracker from './WeightTracker'
import MeasurementsTracker from './MeasurementsTracker'
import { UnitToggle } from './UnitToggle'
import type { Profile } from '@/lib/types'

interface BodyTrackerProps {
  profile: Profile
}

export default function BodyTracker({ profile: initialProfile }: BodyTrackerProps) {
  // Local copy so unit toggles update immediately without waiting for server roundtrip.
  const [profile, setProfile] = useState<Profile>(initialProfile)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Measurements</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
          Track your weight daily and your circumference over time
        </p>
        <UnitToggle
          profile={profile}
          onUpdate={patch => setProfile(p => ({ ...p, ...patch }))}
        />
      </div>

      <div className="space-y-6">
        <WeightTracker
          userId={profile.id}
          weightUnit={profile.weight_unit ?? 'lbs'}
          weightGoal={profile.weight_goal ?? null}
        />
        <MeasurementsTracker
          userId={profile.id}
          lengthUnit={profile.length_unit ?? 'in'}
        />
      </div>
    </div>
  )
}
