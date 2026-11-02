import * as DateTime from 'effect/DateTime'
import * as Function from 'effect/Function'

import {
  CalendarDate,
  DoseMg,
  IanaTimezone,
  InjectionSchedule,
  InjectionScheduleId,
  MedicationCompound,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhase,
  SchedulePhaseId,
  Supplier,
} from '#shared'

import { SucceededFetchNextDose } from '../src/page/schedule/model.js'
import type { ScheduleMessage, ScheduleModel } from '../src/page/schedule/model.js'
import { updateSchedule } from '../src/page/schedule/update.js'

// Shared schedule page fixtures for the schedule story tests.

export const timezone = IanaTimezone.make('Pacific/Auckland')

type UpdateReturn = ReturnType<typeof updateSchedule>

export const update: {
  (message: ScheduleMessage): (model: ScheduleModel) => UpdateReturn
  (model: ScheduleModel, message: ScheduleMessage): UpdateReturn
} = Function.dual(2, (model: ScheduleModel, message: ScheduleMessage): UpdateReturn =>
  updateSchedule(model, message, timezone, 1)
)

export const succeededNextDose = (requestKey = 1): typeof SucceededFetchNextDose.Type =>
  SucceededFetchNextDose({
    nextDose: null,
    requestKey,
    requestedTimezone: timezone,
    timezone,
  })

export const sampleSchedule = InjectionSchedule.make({
  createdAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
  drug: MedicationCompound.make('Semaglutide'),
  frequency: 'weekly',
  id: InjectionScheduleId.make('schedule-1'),
  isActive: false,
  name: ScheduleName.make('Titration'),
  notes: Notes.make('taper slowly'),
  phases: [
    SchedulePhase.make({
      createdAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
      doseMg: DoseMg.make(0.25),
      durationDays: PhaseDurationDays.make(28),
      id: SchedulePhaseId.make('phase-1'),
      order: PhaseOrder.make(1),
      scheduleId: InjectionScheduleId.make('schedule-1'),
      updatedAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
    }),
    SchedulePhase.make({
      createdAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
      doseMg: DoseMg.make(0.5),
      durationDays: null,
      id: SchedulePhaseId.make('phase-2'),
      order: PhaseOrder.make(2),
      scheduleId: InjectionScheduleId.make('schedule-1'),
      updatedAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
    }),
  ],
  supplier: Supplier.make('Pharmacy'),
  startDate: CalendarDate.make('2026-01-15'),
  updatedAt: DateTime.makeUnsafe('2026-01-01T00:00:00Z'),
})

export const validForm: NonNullable<ScheduleModel['form']> = {
  drug: 'Semaglutide',
  supplier: 'Pharmacy',
  editingId: null,
  error: null,
  frequency: 'weekly',
  name: 'Titration',
  notes: '',
  phases: [{ doseMg: '0.25', durationDays: '28', isIndefinite: false, order: 1 }],
  startDate: '2026-01-01',
  submitting: false,
}
