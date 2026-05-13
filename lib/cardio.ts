// Cardio subtype config. Which fields a given machine actually uses,
// what to label them, and example placeholders. The UI reads from here
// instead of hard-coding per-subtype branching everywhere.
//
// Adding a new subtype (e.g. assault bike): add a key here and to the
// `CardioSubtype` union, that's it. The DB column is freeform text so
// no migration is needed.

import type { WeightUnit } from './types'

export const CARDIO_SUBTYPES = [
  'treadmill',
  'stairmaster',
  'cycle',
  'rower',
  'elliptical',
  'other',
] as const

export type CardioSubtype = (typeof CARDIO_SUBTYPES)[number]

export interface CardioFieldConfig {
  speed: boolean
  incline: boolean
  resistance: boolean
}

const FIELDS: Record<CardioSubtype, CardioFieldConfig> = {
  treadmill: { speed: true, incline: true, resistance: false },
  stairmaster: { speed: true, incline: false, resistance: true },
  cycle: { speed: false, incline: false, resistance: true },
  rower: { speed: false, incline: false, resistance: true },
  elliptical: { speed: false, incline: false, resistance: true },
  // "Other" exposes every field so coaches who use unusual machines
  // (e.g. ski erg, jacobs ladder) can still record what matters.
  other: { speed: true, incline: true, resistance: true },
}

export const CARDIO_LABELS: Record<CardioSubtype, string> = {
  treadmill: 'Treadmill',
  stairmaster: 'Stairmaster',
  cycle: 'Cycle',
  rower: 'Rower',
  elliptical: 'Elliptical',
  other: 'Other',
}

export function getCardioFields(subtype: CardioSubtype | null | undefined): CardioFieldConfig {
  if (!subtype) return { speed: false, incline: false, resistance: false }
  return FIELDS[subtype] ?? FIELDS.other
}

// Speed unit follows the user's weight unit choice as a rough proxy for
// imperial vs metric — every imperial-using country I know of uses mph,
// every metric-using country uses kph. Cheaper than another preference
// toggle for one field.
export function speedUnitLabel(weightUnit: WeightUnit): string {
  return weightUnit === 'kg' ? 'kph' : 'mph'
}
