interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-slate-200/70 rounded ${className}`}
      aria-hidden
    />
  )
}

/** A card-shaped skeleton matching the workout / meal-plan / program library grid. */
export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full mb-2" />
      <Skeleton className="h-3 w-4/5 mb-4" />
      <Skeleton className="h-3 w-20 mb-4" />
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
    </div>
  )
}

/** A row-shaped skeleton for list items (clients, etc.). */
export function ListRowSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-4 w-1/3 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-4 rounded shrink-0" />
    </div>
  )
}

/** A grid of card skeletons sized to match the libraries' responsive grid. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}

/** A list of row skeletons. */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Grid of ListRowSkeletons sized to match the client list (1 / 2 / 3 cols).
 * Different from CardGridSkeleton because each cell is a row-shaped card
 * (avatar + name + email + chevron), not a tall library card.
 */
export function ClientGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Row skeleton mirroring an invite-code row: code chip + status pill + two
 * small metadata strings, then a copy button. Stacks on mobile to match the
 * real `flex-col sm:flex-row` row.
 */
export function InviteCodeRowSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Skeleton className="h-9 flex-1 sm:w-28 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  )
}

export function InviteCodeListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <InviteCodeRowSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Row skeleton for trainee-facing assignment cards (workouts, meal plans):
 * title bar + description line + a row of small chips/meta. Mirrors the
 * `p-6` cards in [ClientWorkoutView] / [ClientMealPlanView].
 */
export function AssignmentCardSkeleton({ withChips = false }: { withChips?: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <Skeleton className="h-5 w-1/3 mb-2" />
      <Skeleton className="h-3 w-2/3 mb-4" />
      {withChips ? (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ) : (
        <Skeleton className="h-3 w-32" />
      )}
    </div>
  )
}

/**
 * Row skeleton matching the active-assignment rows on a coach's client
 * detail page (icon tile + 2 lines of text + trash icon button).
 */
export function AssignedItemRowSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-1/2 mb-1.5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
    </div>
  )
}

/**
 * Row skeleton for the PR / lifetime-stat rows on the Progress tab: a
 * left text block (name + meta) and a right value tile.
 */
export function StatRowSkeleton() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-baseline justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-1/2 mb-1.5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="text-right shrink-0">
        <Skeleton className="h-5 w-16 mb-1 ml-auto" />
        <Skeleton className="h-3 w-12 ml-auto" />
      </div>
    </div>
  )
}

/** Summary-tile skeleton (used as a row of 2 on mobile / 4 on desktop). */
export function SummaryTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  )
}
