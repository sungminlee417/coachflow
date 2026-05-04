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
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Measurements</h2>
          <p className="text-sm text-slate-500 mt-1">
            Track your weight daily and your circumference over time
          </p>
        </div>
        <UnitToggle
          profile={profile}
          onUpdate={patch => setProfile(p => ({ ...p, ...patch }))}
        />
      </div>

      <div className="space-y-6">
        <WeightTracker userId={profile.id} weightUnit={profile.weight_unit ?? 'lbs'} />
        <MeasurementsTracker
          userId={profile.id}
          lengthUnit={profile.length_unit ?? 'in'}
        />
      </div>
    </div>
  )
}
