import * as Schema from 'effect/Schema'

// ============================================
// Common Primitives shared across domains
// ============================================

/** User identifier from auth system */
export const UserId = Schema.String.pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type

// ============================================
// Pagination Primitives
// ============================================

/** Limit for pagination (positive integer) */
export const Limit = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('Limit'))
export type Limit = typeof Limit.Type

/** Offset for pagination (non-negative integer) */
export const Offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('Offset'))
export type Offset = typeof Offset.Type

// ============================================
// Notes/Text
// ============================================

/** Free-text notes */
export const Notes = Schema.String.pipe(Schema.brand('Notes'))
export type Notes = typeof Notes.Type

// ============================================
// Database Error Primitives
// ============================================

/** Kind of write/read that failed, shared by the per-domain database error classes */
export const DbOperation = Schema.Literals(['insert', 'update', 'delete', 'query'] as const)
export type DbOperation = typeof DbOperation.Type

// ============================================
// Count/Stats Primitives
// ============================================

/** Non-negative count */
export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('Count'))
export type Count = typeof Count.Type

/** Days between events (non-negative) */
export const DaysBetween = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand('DaysBetween'))
export type DaysBetween = typeof DaysBetween.Type

/** Day of week (0=Sunday, 6=Saturday) */
export const DayOfWeek = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })).pipe(Schema.brand('DayOfWeek'))
export type DayOfWeek = typeof DayOfWeek.Type

// ============================================
// Medication Primitives
// ============================================

/** Supported GLP active compound. */
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
