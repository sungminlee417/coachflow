'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Tracks whether `current` has diverged from a snapshot taken when `ready` first becomes true.
 * Returns `isDirty` for use in UI ("Unsaved changes" indicators).
 *
 * Usage:
 *   const isDirty = useDirtyState(
 *     { name, description, items },  // current state to track
 *     dataLoaded                      // becomes true once initial data is loaded
 *   )
 *
 * For brand-new entities (no fetch needed), pass `ready` as `true` from the start so the
 * snapshot is the initial empty values and any user input becomes dirty.
 */
export function useDirtyState<T>(current: T, ready: boolean): boolean {
  const snapshotRef = useRef<string | null>(null)
  // Force a re-render once we capture the snapshot so the initial isDirty=false renders.
  const [, setSnapshotTaken] = useState(false)

  useEffect(() => {
    if (ready && snapshotRef.current === null) {
      snapshotRef.current = JSON.stringify(current)
      setSnapshotTaken(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  if (snapshotRef.current === null) return false
  return snapshotRef.current !== JSON.stringify(current)
}
