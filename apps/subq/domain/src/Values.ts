import * as Schema from 'effect/Schema'

export const Notes = Schema.String.pipe(Schema.brand('Notes'))

export type Notes = typeof Notes.Type
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('Count'))

export type Count = typeof Count.Type

/** Days between events (non-negative) */
export const DaysBetween = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('DaysBetween'))

export type DaysBetween = typeof DaysBetween.Type

/** Day of week (0=Sunday, 6=Saturday) */
export const DayOfWeek = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })).pipe(Schema.brand('DayOfWeek'))

export type DayOfWeek = typeof DayOfWeek.Type
export const MedicationCompound = Schema.Literals([
  'Semaglutide',
  'Tirzepatide',
  'Retatrutide',
  'Liraglutide',
  'Dulaglutide',
] as const)

export type MedicationCompound = typeof MedicationCompound.Type

/** Optional free-text medication supplier. */
export const Supplier = Schema.NonEmptyString.pipe(Schema.brand('Supplier'))

export type Supplier = typeof Supplier.Type

/** Positive finite active-compound dose in milligrams. */
export const DoseMg = Schema.Finite.check(Schema.isGreaterThan(0)).pipe(Schema.brand('DoseMg'))

export type DoseMg = typeof DoseMg.Type
export const LBS_PER_KG = 2.20462

/**
 * Convert pounds to kilograms.
 * All weights are stored internally as lbs - this is for display only.
 */
export const lbsToKg = (lbs: number): number => lbs / LBS_PER_KG

/**
 * Convert kilograms to pounds.
 * Use this when user inputs weight in kg before storing.
 */
export const kgToLbs = (kg: number): number => kg * LBS_PER_KG
export const WeightLbs = Schema.Finite.check(Schema.isGreaterThan(0)).pipe(Schema.brand('WeightLbs'))

export type WeightLbs = typeof WeightLbs.Type
export const WeightRateOfChange = Schema.Finite.pipe(Schema.brand('WeightRateOfChange'))

export type WeightRateOfChange = typeof WeightRateOfChange.Type
export const InjectionSite = Schema.NonEmptyString.pipe(Schema.brand('InjectionSite'))

export type InjectionSite = typeof InjectionSite.Type

/** Injections per week rate */
export const InjectionsPerWeek = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand('InjectionsPerWeek')
)

export type InjectionsPerWeek = typeof InjectionsPerWeek.Type
export const ScheduleName = Schema.NonEmptyString.pipe(Schema.brand('ScheduleName'))

export type ScheduleName = typeof ScheduleName.Type

/** Frequency of injections (e.g., "weekly", "every 3 days") */
export const Frequency = Schema.Literals(['daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly'] as const)

export type Frequency = typeof Frequency.Type

/** Phase order number (1-based) */
export const PhaseOrder = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('PhaseOrder'))

export type PhaseOrder = typeof PhaseOrder.Type

/** Duration in days for a phase */
export const PhaseDurationDays = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('PhaseDurationDays'))

export type PhaseDurationDays = typeof PhaseDurationDays.Type
export const PaceStatus = Schema.Literals(['on_track', 'ahead', 'behind', 'not_losing'] as const)

export type PaceStatus = typeof PaceStatus.Type

/** Percentage complete (0-100+) */
export const PercentComplete = Schema.Finite.pipe(Schema.brand('PercentComplete'))

export type PercentComplete = typeof PercentComplete.Type

export const WeightUnit = Schema.Literals(['lbs', 'kg'])
export type WeightUnit = typeof WeightUnit.Type
