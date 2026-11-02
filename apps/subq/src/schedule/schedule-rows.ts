import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'

import {
  CalendarDate,
  DoseMg,
  Frequency,
  MedicationCompound,
  Supplier,
  InjectionSchedule,
  InjectionScheduleId,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
} from '#shared'

// ============================================
// Database Row Schemas
// ============================================

export const ScheduleRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  drug: MedicationCompound,
  supplier: Schema.NullOr(Schema.String),
  frequency: Frequency,
  start_date: CalendarDate,
  calendar_date_migrated: Schema.Int,
  is_active: Schema.Int,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

export type ScheduleRow = typeof ScheduleRow.Type

export const DatetimeRow = Schema.Struct({
  datetime: Schema.String,
})

export type DatetimeRow = typeof DatetimeRow.Type

export const PhaseRow = Schema.Struct({
  id: Schema.String,
  schedule_id: Schema.String,
  order: PhaseOrder,
  duration_days: Schema.NullOr(PhaseDurationDays),
  dose_mg: DoseMg,
  created_at: Schema.String,
  updated_at: Schema.String,
})

export type PhaseRow = typeof PhaseRow.Type

// Schema for joined schedule + phase rows (single query with LEFT JOIN)
export const ScheduleWithPhaseRow = Schema.Struct({
  // Schedule fields
  id: Schema.String,
  name: Schema.String,
  drug: MedicationCompound,
  supplier: Schema.NullOr(Schema.String),
  frequency: Frequency,
  start_date: CalendarDate,
  calendar_date_migrated: Schema.Int,
  is_active: Schema.Int,
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  // Phase fields (nullable for schedules with no phases)
  phase_id: Schema.NullOr(Schema.String),
  phase_schedule_id: Schema.NullOr(Schema.String),
  phase_order: Schema.NullOr(PhaseOrder),
  phase_duration_days: Schema.NullOr(PhaseDurationDays),
  phase_dose_mg: Schema.NullOr(DoseMg),
  phase_created_at: Schema.NullOr(Schema.String),
  phase_updated_at: Schema.NullOr(Schema.String),
})

export type ScheduleWithPhaseRow = typeof ScheduleWithPhaseRow.Type

export const phaseRowToDomain = (row: PhaseRow): SchedulePhase =>
  SchedulePhase.make({
    id: SchedulePhaseId.make(row.id),
    scheduleId: InjectionScheduleId.make(row.schedule_id),
    order: row.order,
    durationDays: row.duration_days,
    doseMg: row.dose_mg,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })

export const scheduleRowToDomain: {
  (phases: Array<SchedulePhase>): (row: ScheduleRow) => InjectionSchedule
  (row: ScheduleRow, phases: Array<SchedulePhase>): InjectionSchedule
} = Function.dual(2, (row: ScheduleRow, phases: Array<SchedulePhase>): InjectionSchedule =>
  InjectionSchedule.make({
    id: InjectionScheduleId.make(row.id),
    name: ScheduleName.make(row.name),
    drug: row.drug,
    supplier: row.supplier !== null && Str.isNonEmpty(row.supplier) ? Supplier.make(row.supplier) : null,
    frequency: row.frequency,
    startDate: row.start_date,
    isActive: row.is_active === 1,
    notes: row.notes !== null && Str.isNonEmpty(row.notes) ? Notes.make(row.notes) : null,
    phases,
    createdAt: DateTime.makeUnsafe(row.created_at),
    updatedAt: DateTime.makeUnsafe(row.updated_at),
  })
)

// Extract a phase from a joined row (LEFT JOIN may return null phase columns)
const joinedRowToPhase = (row: ScheduleWithPhaseRow): Option.Option<SchedulePhase> => {
  if (
    row.phase_id === null ||
    row.phase_schedule_id === null ||
    row.phase_order === null ||
    row.phase_dose_mg === null ||
    row.phase_created_at === null ||
    row.phase_updated_at === null
  ) {
    return Option.none()
  }

  return Option.some(
    SchedulePhase.make({
      id: SchedulePhaseId.make(row.phase_id),
      scheduleId: InjectionScheduleId.make(row.phase_schedule_id),
      order: row.phase_order,
      durationDays: row.phase_duration_days,
      doseMg: row.phase_dose_mg,
      createdAt: DateTime.makeUnsafe(row.phase_created_at),
      updatedAt: DateTime.makeUnsafe(row.phase_updated_at),
    })
  )
}

const joinedRowToScheduleRow = (row: ScheduleWithPhaseRow): ScheduleRow => ({
  id: row.id,
  name: row.name,
  drug: row.drug,
  supplier: row.supplier,
  frequency: row.frequency,
  start_date: row.start_date,
  calendar_date_migrated: row.calendar_date_migrated,
  is_active: row.is_active,
  notes: row.notes,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

// Helper to group joined rows into schedules with phases (avoids N+1 queries)
export const groupSchedulesWithPhases = (rows: Array<ScheduleWithPhaseRow>): Array<InjectionSchedule> => {
  const grouped = Arr.groupBy(rows, (row) => row.id)

  return Arr.map(R.values(grouped), (group) => {
    const schedule = joinedRowToScheduleRow(Arr.headNonEmpty(group))
    const phases = Arr.getSomes(Arr.map(group, joinedRowToPhase))

    return scheduleRowToDomain(schedule, phases)
  })
}
