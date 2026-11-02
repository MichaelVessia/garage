import * as DateTime from 'effect/DateTime'

import {
  CalendarDate,
  DoseMg,
  IanaTimezone,
  InjectionLog,
  InjectionLogId,
  InjectionSchedule,
  InjectionScheduleId,
  InjectionSite,
  MedicationCompound,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
  Supplier,
} from '#shared'

import type { InjectionForm } from '../src/page/injections/model.js'

// Shared injection-page fixtures for the injection story tests.

export const timezone = IanaTimezone.make('America/New_York')

export const sampleLog = InjectionLog.make({
  createdAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  datetime: DateTime.makeUnsafe('2026-07-01T08:00:00Z'),
  doseMg: DoseMg.make(2.5),
  drug: MedicationCompound.make('Semaglutide'),
  id: InjectionLogId.make('inj-1'),
  injectionSite: InjectionSite.make('Abdomen'),
  notes: Notes.make('no issues'),
  scheduleId: InjectionScheduleId.make('sched-1'),
  supplier: Supplier.make('Pharmacy'),
  updatedAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
})

export const bareLog = InjectionLog.make({
  createdAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
  datetime: DateTime.makeUnsafe('2026-07-01T08:00:00Z'),
  doseMg: DoseMg.make(5),
  drug: MedicationCompound.make('Tirzepatide'),
  id: InjectionLogId.make('inj-2'),
  injectionSite: null,
  notes: null,
  scheduleId: null,
  supplier: null,
  updatedAt: DateTime.makeUnsafe('2026-07-01T00:00:00Z'),
})

export const sampleSchedule = InjectionSchedule.make({
  createdAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
  drug: MedicationCompound.make('Semaglutide'),
  frequency: 'weekly',
  id: InjectionScheduleId.make('sched-1'),
  isActive: true,
  name: ScheduleName.make('Titration'),
  notes: null,
  phases: [
    SchedulePhase.make({
      createdAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
      doseMg: DoseMg.make(2.5),
      durationDays: PhaseDurationDays.make(28),
      id: SchedulePhaseId.make('phase-1'),
      order: PhaseOrder.make(1),
      scheduleId: InjectionScheduleId.make('sched-1'),
      updatedAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
    }),
  ],
  supplier: null,
  startDate: CalendarDate.make('2026-06-01'),
  updatedAt: DateTime.makeUnsafe('2026-06-01T00:00:00Z'),
})

export const injectionAt = ({ id, datetime }: { readonly id: string; readonly datetime: string }): InjectionLog =>
  InjectionLog.make({
    createdAt: sampleLog.createdAt,
    datetime: DateTime.makeUnsafe(datetime),
    doseMg: sampleLog.doseMg,
    drug: sampleLog.drug,
    id: InjectionLogId.make(id),
    injectionSite: sampleLog.injectionSite,
    notes: sampleLog.notes,
    scheduleId: sampleLog.scheduleId,
    supplier: sampleLog.supplier,
    updatedAt: sampleLog.updatedAt,
  })

// A filled-in add form; tests override only the fields under test.
export const injectionForm = (overrides: Partial<InjectionForm> = {}): InjectionForm => ({
  confirmedOffSchedule: false,
  datetime: '2026-07-04T09:00',
  doseMg: '2.5',
  drug: 'Semaglutide',
  editingId: null,
  error: null,
  injectionSite: '',
  maxDatetime: '2026-07-04T09:00',
  notes: '',
  originalDatetime: null,
  scheduleId: '',
  supplier: '',
  submitting: false,
  ...overrides,
})
