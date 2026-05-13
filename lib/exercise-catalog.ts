// Curated exercise catalog. Sourced from yuhonas/free-exercise-db (MIT
// licensed) — 873 entries with name, equipment, muscles targeted, etc.
// Instructions + GIF paths were stripped on import to keep the bundle
// reasonable; this file is the runtime-accessible slim copy.
//
// The catalog is the *fast path* — coaches can still type custom exercise
// names freeform. Picking a catalog entry just stamps `catalog_id` on the
// `exercises` row so we can dereference muscles/equipment/difficulty later
// (e.g. "find me chest exercises with a barbell").

import rawCatalog from './exercise-catalog.json'

export type ExerciseCategory =
  | 'strength'
  | 'cardio'
  | 'stretching'
  | 'plyometrics'
  | 'powerlifting'
  | 'olympic weightlifting'
  | 'strongman'

export interface CatalogEntry {
  id: string
  name: string
  category: ExerciseCategory | null
  equipment: string | null
  level: 'beginner' | 'intermediate' | 'expert' | null
  mechanic: 'compound' | 'isolation' | null
  force: 'push' | 'pull' | 'static' | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
}

export const exerciseCatalog: CatalogEntry[] = rawCatalog as CatalogEntry[]

// Build a `id → entry` map up front so lookups stay O(1) regardless of how
// many times components dereference catalog ids.
const byId = new Map<string, CatalogEntry>(
  exerciseCatalog.map(e => [e.id, e])
)

export function getCatalogEntry(id: string | null | undefined): CatalogEntry | null {
  if (!id) return null
  return byId.get(id) ?? null
}

/**
 * Substring search across the catalog. Case-insensitive, ranks exact
 * prefix matches above mid-string matches. Returns at most `limit` entries
 * so the dropdown stays snappy on long-typing.
 */
export function searchCatalog(query: string, limit = 12): CatalogEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const prefix: CatalogEntry[] = []
  const contains: CatalogEntry[] = []
  for (const e of exerciseCatalog) {
    const name = e.name.toLowerCase()
    if (name.startsWith(q)) prefix.push(e)
    else if (name.includes(q)) contains.push(e)
    if (prefix.length + contains.length >= limit * 2) break
  }
  return [...prefix, ...contains].slice(0, limit)
}
