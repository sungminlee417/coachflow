/**
 * Dashed-border placeholder shown when a builder's item list is empty.
 * Same shape across MealPlan / Workout / Program — only the prompt
 * copy changes.
 */
export function EmptyStateCard({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 border-dashed p-8 text-center">
      <p className="text-slate-400 text-sm">{message}</p>
    </div>
  )
}
