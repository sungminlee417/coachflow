'use client'

import WeightTracker from './WeightTracker'
import MeasurementsTracker from './MeasurementsTracker'

interface BodyTrackerProps {
  userId: string
}

export default function BodyTracker({ userId }: BodyTrackerProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Measurements</h2>
        <p className="text-sm text-slate-500 mt-1">
          Track your weight daily and your circumference over time
        </p>
      </div>

      <div className="space-y-6">
        <WeightTracker userId={userId} />
        <MeasurementsTracker userId={userId} />
      </div>
    </div>
  )
}
