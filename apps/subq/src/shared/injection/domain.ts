import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { DbOperation, Dosage, DrugName, DrugSource, Limit, Notes, Offset } from '../common/domain.js'
import { InjectionScheduleId } from '../schedule/domain.js'

// ============================================
// Injection Domain Entity ID
// ============================================

/** UUID identifier for injection log entries */
export const InjectionLogId = Schema.String.pipe(Schema.brand('InjectionLogId'))
export type InjectionLogId = typeof InjectionLogId.Type

// ============================================
// Injection Domain Primitives
// ============================================

/** Injection site location */
export const InjectionSite = Schema.NonEmptyString.pipe(Schema.brand('InjectionSite'))
export type InjectionSite = typeof InjectionSite.Type

/** Injections per week rate */
export const InjectionsPerWeek = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand('InjectionsPerWeek')
)
export type InjectionsPerWeek = typeof InjectionsPerWeek.Type

// ============================================
// Injection Domain Errors
// ============================================

export class InjectionLogNotFoundError extends Schema.TaggedClass<InjectionLogNotFoundError>()(
  'InjectionLogNotFoundError',
  {
    id: Schema.String,
  }
) {}

export class InjectionLogDatabaseError extends Schema.TaggedClass<InjectionLogDatabaseError>()(
  'InjectionLogDatabaseError',
  {
    operation: DbOperation,
    cause: Schema.Defect(),
  }
) {}

export class ScheduleAssignmentTargetNotFoundError extends Schema.TaggedClass<ScheduleAssignmentTargetNotFoundError>()(
  'ScheduleAssignmentTargetNotFoundError',
  {
    scheduleId: Schema.String,
  }
) {}

export const InjectionLogError = Schema.Union([
  InjectionLogNotFoundError,
  InjectionLogDatabaseError,
  ScheduleAssignmentTargetNotFoundError,
])
export type InjectionLogError = typeof InjectionLogError.Type
// ============================================
// Core Domain Type
// ============================================

/**
 * An injection log entry represents a single injection event.
 * Used for tracking medication injections (TRT, peptides, etc.)
 */
export class InjectionLog extends Schema.Class<InjectionLog>('InjectionLog')({
  id: InjectionLogId,
  datetime: Schema.DateTimeUtc,
  drug: DrugName,
  source: Schema.NullOr(DrugSource),
  dosage: Dosage,
  injectionSite: Schema.NullOr(InjectionSite),
  notes: Schema.NullOr(Notes),
  scheduleId: Schema.NullOr(InjectionScheduleId),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
}) {}

// ============================================
// Input Types
// ============================================

/**
 * Payload for creating a new injection log entry.
 */
export class InjectionLogCreate extends Schema.Class<InjectionLogCreate>('InjectionLogCreate')({
  datetime: Schema.DateTimeUtc,
  drug: DrugName,
  source: Schema.OptionFromOptional(DrugSource),
  dosage: Dosage,
  injectionSite: Schema.OptionFromOptional(InjectionSite),
  notes: Schema.OptionFromOptional(Notes),
  scheduleId: Schema.OptionFromOptional(InjectionScheduleId),
}) {}

/**
 * Payload for updating an existing injection log entry.
 */
export class InjectionLogUpdate extends Schema.Class<InjectionLogUpdate>('InjectionLogUpdate')({
  id: InjectionLogId,
  datetime: Schema.optional(Schema.DateTimeUtc),
  drug: Schema.optional(DrugName),
  source: Schema.OptionFromOptionalNullOr(DrugSource),
  dosage: Schema.optional(Dosage),
  injectionSite: Schema.OptionFromOptionalNullOr(InjectionSite),
  notes: Schema.OptionFromOptionalNullOr(Notes),
  scheduleId: Schema.OptionFromOptionalNullOr(InjectionScheduleId),
}) {}

/**
 * Payload for deleting an injection log entry.
 */
export class InjectionLogDelete extends Schema.Class<InjectionLogDelete>('InjectionLogDelete')({
  id: InjectionLogId,
}) {}

/**
 * Parameters for listing injection logs.
 */
export class InjectionLogListParams extends Schema.Class<InjectionLogListParams>('InjectionLogListParams')({
  limit: Limit.pipe(Schema.withDecodingDefaultType(Effect.succeed(Limit.make(50)))),
  offset: Offset.pipe(Schema.withDecodingDefaultType(Effect.succeed(Offset.make(0)))),
  startDate: Schema.optional(Schema.DateTimeUtc),
  endDate: Schema.optional(Schema.DateTimeUtc),
  drug: Schema.optional(DrugName),
}) {}

/**
 * Payload for bulk assigning injection logs to a schedule.
 */
export class InjectionLogBulkAssignSchedule extends Schema.Class<InjectionLogBulkAssignSchedule>(
  'InjectionLogBulkAssignSchedule'
)({
  ids: Schema.Array(InjectionLogId),
  scheduleId: Schema.NullOr(InjectionScheduleId),
}) {}
