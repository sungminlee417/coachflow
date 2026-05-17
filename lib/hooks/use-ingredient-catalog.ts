'use client'

// "What ingredients has this coach used before?"
//
// Powers the autocomplete in the meal-plan builder so typing
// "chicken" surfaces every previously-saved chicken row with its
// macros pre-filled. Reads across every ingredient the coach has
// ever entered (any meal plan), dedupes by lowercased name keeping
// the most recently-saved row, and sorts alphabetically for stable
// dropdown order.
//
// Cache TTL is 60s so freshly-saved ingredients land in suggestions
// without manual invalidation. The query is cheap (500-row cap, no
// nested children) and shared via the standard TanStack cache, so
// many open IngredientRows in one session all read the same payload.

import { useQuery } from '@tanstack/react-query'
import { useSupabase } from '@/lib/use-supabase'

export interface IngredientCatalogEntry {
  name: string
  quantity: string
  calories: number | null
  protein_grams: number | null
  carbs_grams: number | null
  fat_grams: number | null
}

interface RawRow extends IngredientCatalogEntry {
  id: string
}

export function useIngredientCatalog(coachId: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: ['ingredient_catalog', coachId] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<IngredientCatalogEntry[]> => {
      // PostgREST embed walks ingredients → foods → meals → meal_plans
      // to filter by coach_id, then we select only the ingredient
      // columns we display. `!inner` everywhere so rows orphaned at
      // any join level don't sneak through.
      const { data, error } = await supabase
        .from('ingredients')
        .select(
          `id, name, quantity, calories, protein_grams, carbs_grams, fat_grams,
           foods!inner ( meals!inner ( meal_plans!inner ( coach_id ) ) )`
        )
        .eq('foods.meals.meal_plans.coach_id', coachId)
        .order('id', { ascending: false })
        .limit(500)
      if (error) throw error
      const seen = new Map<string, IngredientCatalogEntry>()
      for (const row of (data ?? []) as RawRow[]) {
        const key = (row.name ?? '').trim().toLowerCase()
        if (!key) continue
        if (!seen.has(key)) {
          seen.set(key, {
            name: row.name,
            quantity: row.quantity ?? '',
            calories: row.calories,
            protein_grams: row.protein_grams,
            carbs_grams: row.carbs_grams,
            fat_grams: row.fat_grams,
          })
        }
      }
      return Array.from(seen.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    },
  })
}
