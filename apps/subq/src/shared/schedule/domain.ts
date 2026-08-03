import * as Schema from 'effect/Schema'

import { DoseMg, MedicationCompound, Notes, Supplier } from '../common/domain.js'

// ============================================
// Schedule Domain Entity IDs
// ============================================

/** UUID identifier for injection schedules */
export const InjectionScheduleId = Schema.String.pipe(Schema.brand('InjectionScheduleId'))
export type InjectionScheduleId = typeof InjectionScheduleId.Type

/** UUID identifier for schedule phases */
export const SchedulePhaseId = Schema.String.pipe(Schema.brand('SchedulePhaseId'))
export type SchedulePhaseId = typeof SchedulePhaseId.Type

// ============================================
// Schedule Domain Primitives
// ============================================

/** Schedule name/label */
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

// ============================================
// Schedule Domain Errors
// ============================================

// ============================================
// Schedule Phase - a single step in the titration
// ============================================

/**
 * A phase represents one step in a titration schedule.
 * E.g., "Month 1: 2.5 mg weekly" would be one phase.
 * If durationDays is null, the phase is indefinite (maintenance phase).
 */
export class SchedulePhase extends Schema.Class<SchedulePhase>('SchedulePhase')({
  id: SchedulePhaseId,
  scheduleId: InjectionScheduleId,
  order: PhaseOrder,
  durationDays: Schema.NullOr(PhaseDurationDays),
  doseMg: DoseMg,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

export class SchedulePhaseCreate extends Schema.Class<SchedulePhaseCreate>('SchedulePhaseCreate')({
  order: PhaseOrder,
  durationDays: Schema.NullOr(PhaseDurationDays),
  doseMg: DoseMg,
}) {}

// ============================================
// Injection Schedule - the full schedule with phases
// ============================================

/**
 * An injection schedule tracks a user's prescribed injection regimen.
 * Contains multiple phases for titration schedules.
 */
export class InjectionSchedule extends Schema.Class<InjectionSchedule>('InjectionSchedule')({
  id: InjectionScheduleId,
  name: ScheduleName,
  drug: MedicationCompound,
  supplier: Schema.NullOr(Supplier),
  frequency: Frequency,
  startDate: Schema.DateTimeUtc,
  isActive: Schema.Boolean,
  notes: Schema.NullOr(Notes),
  phases: Schema.Array(SchedulePhase),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

/**
 * Payload for creating a new injection schedule.
 */
export class InjectionScheduleCreate extends Schema.Class<InjectionScheduleCreate>('InjectionScheduleCreate')({
  name: ScheduleName,
  drug: MedicationCompound,
  supplier: Schema.OptionFromOptional(Supplier),
  frequency: Frequency,
  startDate: Schema.DateTimeUtc,
  notes: Schema.OptionFromOptional(Notes),
  phases: Schema.Array(SchedulePhaseCreate),
}) {}

/**
 * Payload for updating an existing injection schedule.
 */
export class InjectionScheduleUpdate extends Schema.Class<InjectionScheduleUpdate>('InjectionScheduleUpdate')({
  id: InjectionScheduleId,
  name: Schema.optional(ScheduleName),
  drug: Schema.optional(MedicationCompound),
  supplier: Supplier.pipe(Schema.NullOr, Schema.optional),
  frequency: Schema.optional(Frequency),
  startDate: Schema.optional(Schema.DateTimeUtc),
  isActive: Schema.optional(Schema.Boolean),
  notes: Notes.pipe(Schema.NullOr, Schema.optional),
  phases: SchedulePhaseCreate.pipe(Schema.Array, Schema.optional),
}) {}

/**
 * Payload for deleting an injection schedule.
 */
export class InjectionScheduleDelete extends Schema.Class<InjectionScheduleDelete>('InjectionScheduleDelete')({
  id: InjectionScheduleId,
}) {}

// ============================================
// Next Dose Calculation Types
// ============================================

/**
 * Represents the next scheduled dose for a user.
 */
export class NextScheduledDose extends Schema.Class<NextScheduledDose>('NextScheduledDose')({
  scheduleId: InjectionScheduleId,
  scheduleName: ScheduleName,
  drug: MedicationCompound,
  doseMg: DoseMg,
  suggestedDate: Schema.DateTimeUtc,
  currentPhase: PhaseOrder,
  totalPhases: Schema.Number,
  daysUntilDue: Schema.Number,
  isOverdue: Schema.Boolean,
}) {}

// ============================================
// Schedule View Types
// ============================================

/**
 * Summary of a completed injection associated with a schedule phase.
 */
export class PhaseInjectionSummary extends Schema.Class<PhaseInjectionSummary>('PhaseInjectionSummary')({
  id: Schema.String,
  datetime: Schema.DateTimeUtc,
  doseMg: DoseMg,
  injectionSite: Schema.NullOr(Schema.String),
}) {}

/**
 * Progress and details for a single phase in the schedule view.
 * If durationDays is null, the phase is indefinite (no end date).
 */
export class SchedulePhaseView extends Schema.Class<SchedulePhaseView>('SchedulePhaseView')({
  id: SchedulePhaseId,
  order: PhaseOrder,
  durationDays: Schema.NullOr(PhaseDurationDays),
  doseMg: DoseMg,
  startDate: Schema.DateTimeUtc,
  endDate: Schema.NullOr(Schema.DateTimeUtc),
  status: Schema.Literals(['completed', 'current', 'upcoming'] as const),
  expectedInjections: Schema.NullOr(Schema.Number),
  completedInjections: Schema.Number,
  injections: Schema.Array(PhaseInjectionSummary),
}) {}

/**
 * Full schedule view with all phases and their progress.
 * If endDate is null, the schedule has an indefinite final phase.
 */
export class ScheduleView extends Schema.Class<ScheduleView>('ScheduleView')({
  id: InjectionScheduleId,
  name: ScheduleName,
  drug: MedicationCompound,
  supplier: Schema.NullOr(Supplier),
  frequency: Frequency,
  startDate: Schema.DateTimeUtc,
  endDate: Schema.NullOr(Schema.DateTimeUtc),
  isActive: Schema.Boolean,
  notes: Schema.NullOr(Notes),
  totalExpectedInjections: Schema.NullOr(Schema.Number),
  totalCompletedInjections: Schema.Number,
  phases: Schema.Array(SchedulePhaseView),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}
