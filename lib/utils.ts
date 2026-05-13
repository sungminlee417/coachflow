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

/** Add (or subtract, with negative input) calendar days to a YYYY-MM-DD string. */
export const shiftDateISO = (dateISO: string, days: number): string => {
  const d = parseLocalISO(dateISO)
  d.setDate(d.getDate() + days)
  return toLocalISO(d)
}

/**
 * Whole-day signed difference between two YYYY-MM-DD strings.
 *
 * Uses UTC math under the hood — local-time arithmetic across DST transitions
 * can produce a 23- or 25-hour day that rounds wrong. Both operands are
 * date-only (no time) so this is safe.
 */
export const daysBetween = (fromISO: string, toISO: string): number => {
  const [ay, am, ad] = fromISO.split('-').map(Number)
  const [by, bm, bd] = toISO.split('-').map(Number)
  const a = Date.UTC(ay, am - 1, ad)
  const b = Date.UTC(by, bm - 1, bd)
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

/**
 * Position within an N-day rotation (1-based).
 * Returns null if the date precedes the anchor or inputs are invalid.
 */
export const cyclePositionFor = (
  anchorISO: string | null | undefined,
  dateISO: string,
  cycleLength: number | null | undefined
): number | null => {
  if (!anchorISO || !cycleLength || cycleLength < 1) return null
  const diff = daysBetween(anchorISO, dateISO)
  if (diff < 0) return null
  return (diff % cycleLength) + 1
}

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

// Crockford-style base32 alphabet — omits I, L, O, U to avoid visual
// confusion (I/1, L/1, O/0, U/V) when a coach reads the code aloud or a
// trainee transcribes it from a screenshot.
const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const INVITE_CODE_LENGTH = 10

/**
 * Generate a random invite code with cryptographic entropy.
 *
 * 10 chars × log2(30) ≈ 49 bits of entropy → 5.6 × 10^14 possibilities,
 * which puts brute-force well out of reach for the existing single-use,
 * revocable, and (when the coach sets one) time-bounded invite design.
 * `Math.random()` was the previous implementation; ~40 bits is roughly
 * brute-forceable in a week at 1k req/sec, hence the swap.
 */
export const generateInviteCode = (): string => {
  // Server-side rendering doesn't normally call this, but if it ever
  // does we fall back to a Node-style randomness path.
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined
  const buf = new Uint8Array(INVITE_CODE_LENGTH)
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(buf)
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < buf.length; i++) {
    out += INVITE_CODE_ALPHABET[buf[i] % INVITE_CODE_ALPHABET.length]
  }
  return out
}

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
 * Format a length value for display.
 *  - inches: snaps to nearest 1/8 and renders as "14 ⅛"
 *  - cm: shows up to 1 decimal (e.g. "35.5")
 */
const FRACTION_GLYPHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'] as const

export const formatLength = (
  value: number | null | undefined,
  unit: 'in' | 'cm'
): string => {
  if (value == null) return ''
  if (unit !== 'in') return String(Math.round(value * 10) / 10)

  // Snap to nearest 1/8 inch.
  const eighths = Math.round(value * 8)
  const whole = Math.trunc(eighths / 8)
  const remainder = eighths % 8
  const sign = value < 0 && whole === 0 ? '-' : ''
  const wholeAbs = Math.abs(whole)

  if (remainder === 0) return `${sign}${wholeAbs}`
  const glyph = FRACTION_GLYPHS[remainder]
  if (wholeAbs === 0) return `${sign}${glyph}`
  return `${sign}${wholeAbs} ${glyph}`
}

/**
 * Parse a length value supporting decimals AND mixed-number fractions.
 *  "14"        → 14
 *  "14.125"    → 14.125
 *  "14 1/8"    → 14.125
 *  "14-1/8"    → 14.125
 *  "1/8"       → 0.125
 *  ""          → null
 *  invalid     → null
 */
export const parseLength = (raw: string | null | undefined): number | null => {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null

  // Mixed number with fraction: "14 1/8" or "14-1/8"
  const mixed = trimmed.match(/^(-?\d+(?:\.\d+)?)[\s-]+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1])
    const num = Number(mixed[2])
    const denom = Number(mixed[3])
    if (denom === 0) return null
    const sign = whole < 0 ? -1 : 1
    return whole + sign * (num / denom)
  }

  // Bare fraction: "1/8" or "-1/8"
  const frac = trimmed.match(/^(-?\d+)\s*\/\s*(\d+)$/)
  if (frac) {
    const denom = Number(frac[2])
    if (denom === 0) return null
    return Number(frac[1]) / denom
  }

  // Plain number / decimal
  const num = Number(trimmed)
  return Number.isFinite(num) ? num : null
}

/**
 * Parse a duration string into seconds. Accepts:
 *   "20"        → 1200  (bare number = minutes)
 *   "20:30"     → 1230  (mm:ss)
 *   "1:20:30"   → 4830  (hh:mm:ss)
 *   "20m"       → 1200
 *   "20m 30s"   → 1230
 *   "1h 20m"    → 4800
 *   "30s"       → 30
 *   ""          → null
 *   invalid     → null
 */
export const parseDuration = (raw: string | null | undefined): number | null => {
  if (raw == null) return null
  const trimmed = String(raw).trim().toLowerCase()
  if (!trimmed) return null

  // Colon form: hh:mm:ss or mm:ss
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(p => Number(p.trim()))
    if (parts.some(n => !Number.isFinite(n) || n < 0)) return null
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return null
  }

  // Suffix form: "1h 20m 30s", "30 min", "1 hour 20 minutes", etc.
  // Hours: h | hr | hrs | hour | hours
  // Minutes: m | min | mins | minute | minutes
  // Seconds: s | sec | secs | second | seconds
  const suffixMatch = trimmed.match(
    /^(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b)?\s*(?:(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b)?\s*(?:(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b)?$/
  )
  if (suffixMatch && (suffixMatch[1] || suffixMatch[2] || suffixMatch[3])) {
    const h = Number(suffixMatch[1] ?? 0)
    const m = Number(suffixMatch[2] ?? 0)
    const s = Number(suffixMatch[3] ?? 0)
    return Math.round(h * 3600 + m * 60 + s)
  }

  // Bare number = minutes
  const num = Number(trimmed)
  if (Number.isFinite(num) && num >= 0) return Math.round(num * 60)

  return null
}

/**
 * Format a duration in seconds as a compact, human-friendly string.
 *   45     → "45s"
 *   1200   → "20 min"
 *   1230   → "20:30"
 *   4830   → "1:20:30"
 *   null   → ""
 */
export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const h = Math.trunc(s / 3600)
  const m = Math.trunc((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  if (sec === 0) return `${m} min`
  return `${m}:${String(sec).padStart(2, '0')}`
}

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
