'use client'

import { ArrowLeft } from 'lucide-react'
import { IconButton } from './IconButton'

/**
 * Back-arrow + title strip rendered at the top of every builder
 * (MealPlan, Workout, Program). Identical pattern across all three;
 * lives here so the visual + accessibility wiring stays in one place.
 */
export function BuilderHeader({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <IconButton onClick={onBack} aria-label="Go back">
        <ArrowLeft size={18} />
      </IconButton>
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
    </div>
  )
}
