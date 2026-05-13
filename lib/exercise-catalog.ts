// Curated exercise catalog. Sourced from yuhonas/free-exercise-db (MIT
// licensed) — 873 entries with name, equipment, muscles targeted, etc.
// Instructions + GIF paths were stripped on import to keep the bundle
// reasonable; this file is the runtime-accessible slim copy.
//
// The catalog is the *fast path* — coaches can still type custom exercise
// names freeform. Picking a catalog entry just stamps `catalog_id` on the
// `exercises` row so we can dereference muscles/equipment/difficulty later
// (e.g. "find me chest exercises with a barbell").
//
// Bundle note: the JSON is ~200 KB and we don't want it in the dashboard's
// initial chunk. Everything below is lazy — the JSON only loads on the
// first call to `searchCatalog`/`getCatalogEntry`, which happens the first
// time a coach focuses an exercise name input.

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

interface CatalogIndex {
  list: CatalogEntry[]
  byId: Map<string, CatalogEntry>
}

let cachedIndex: CatalogIndex | null = null
let inflight: Promise<CatalogIndex> | null = null

/**
 * Load (or return the already-loaded) catalog index. The dynamic import
 * keeps the 200 KB JSON out of the initial JS chunk; once it resolves
 * we build an `id → entry` lookup map and keep both around for the
 * lifetime of the tab.
 */
export async function loadCatalog(): Promise<CatalogIndex> {
  if (cachedIndex) return cachedIndex
  if (!inflight) {
    inflight = import('./exercise-catalog.json').then(mod => {
      const list = mod.default as CatalogEntry[]
      const byId = new Map<string, CatalogEntry>(list.map(e => [e.id, e]))
      cachedIndex = { list, byId }
      inflight = null
      return cachedIndex
    })
  }
  return inflight
}

export async function getCatalogEntry(
  id: string | null | undefined
): Promise<CatalogEntry | null> {
  if (!id) return null
  const idx = await loadCatalog()
  return idx.byId.get(id) ?? null
}

/**
 * Substring search across the catalog. Case-insensitive, ranks exact
 * prefix matches above mid-string matches. Returns at most `limit` entries
 * so the dropdown stays snappy on long-typing. Async because the catalog
 * is dynamically imported on first call — subsequent calls are sync-fast
 * (the JSON stays in module-scoped cache).
 */
export async function searchCatalog(query: string, limit = 12): Promise<CatalogEntry[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const { list } = await loadCatalog()
  const prefix: CatalogEntry[] = []
  const contains: CatalogEntry[] = []
  for (const e of list) {
    const name = e.name.toLowerCase()
    if (name.startsWith(q)) prefix.push(e)
    else if (name.includes(q)) contains.push(e)
    if (prefix.length + contains.length >= limit * 2) break
  }
  return [...prefix, ...contains].slice(0, limit)
}
