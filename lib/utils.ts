import type { Food, Meal, MacroTotals } from './types'

/**
 * Format a Date as YYYY-MM-DD using LOCAL components.
 * (Date.toISOString() returns UTC, which causes off-by-one errors.)
 */
const toLocalISO = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Parse a YYYY-MM-DD string as LOCAL midnight.
 * (new Date("YYYY-MM-DD") parses as UTC, which shifts in non-UTC timezones.)
 */
const parseLocalISO = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = () => toLocalISO(new Date())

/** Get the local weekday (0=Sun..6=Sat) for a YYYY-MM-DD string. */
export const weekdayOf = (dateISO: string): number => parseLocalISO(dateISO).getDay()

/** Get the local day-of-month for a YYYY-MM-DD string. */
export const dayOfMonthOf = (dateISO: string): number => parseLocalISO(dateISO).getDate()

export const formatDate = (
  dateString: string,
  opts?: Intl.DateTimeFormatOptions
): string => {
  // Date-only strings parse as local. Full timestamps go through Date directly.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? parseLocalISO(dateString)
    : new Date(dateString)
  return date.toLocaleDateString(
    'en-US',
    opts ?? {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  )
}

export const formatLongDate = (dateString: string) =>
  formatDate(dateString, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

export const getWeekDates = (selectedDateISO: string): string[] => {
  const selected = parseLocalISO(selectedDateISO)
  const dayOfWeek = selected.getDay()
  const sunday = new Date(selected)
  sunday.setDate(selected.getDate() - dayOfWeek)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return toLocalISO(d)
  })
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const generateInviteCode = () =>
  Math.random().toString(36).substring(2, 10).toUpperCase()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const unwrapJoin = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null
  return (value ?? null) as T | null
}

const sumMacros = (
  items: Array<{
    calories?: number | null
    protein_grams?: number | null
    carbs_grams?: number | null
    fat_grams?: number | null
  }>
): MacroTotals =>
  items.reduce<MacroTotals>(
    (acc, item) => ({
      calories: acc.calories + (item.calories ?? 0),
      protein_grams: acc.protein_grams + (item.protein_grams ?? 0),
      carbs_grams: acc.carbs_grams + (item.carbs_grams ?? 0),
      fat_grams: acc.fat_grams + (item.fat_grams ?? 0),
    }),
    { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 }
  )

/** Macros for a single food. Derived from ingredients if present, otherwise the food's manual values. */
export const computeFoodMacros = (food: Food): MacroTotals => {
  if (food.ingredients && food.ingredients.length > 0) {
    return sumMacros(food.ingredients)
  }
  return {
    calories: food.calories ?? 0,
    protein_grams: food.protein_grams ?? 0,
    carbs_grams: food.carbs_grams ?? 0,
    fat_grams: food.fat_grams ?? 0,
  }
}

/** Macros for a meal. Always derived from its foods. */
export const computeMealMacros = (meal: Meal): MacroTotals =>
  sumMacros((meal.foods ?? []).map(computeFoodMacros))

/** Round a macro value for display (1 decimal max). */
export const roundMacro = (value: number): number => Math.round(value * 10) / 10

/**
 * Format a "HH:MM" or "HH:MM:SS" string as a friendly 12-hour time.
 * Returns "" if the input is null/empty.
 */
export const formatTime = (time: string | null | undefined): string => {
  if (!time) return ''
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}
