import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import { Command } from 'foldkit'

import {
  CalendarDate,
  DoseMg,
  Frequency,
  IanaTimezone,
  InjectionSchedule,
  InjectionScheduleCreate,
  InjectionScheduleDelete,
  InjectionScheduleId,
  InjectionScheduleUpdate,
  MedicationCompound,
  Notes,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseCreate,
  Supplier,
} from '#shared'

import { Api } from '../../api.js'
import { toCommandResult } from '../../lib/command.js'
import { utcToLocalDateString } from '../../lib/datetime.js'
import {
  CompletedOpenScheduleForm,
  FailedActivateSchedule,
  FailedDeleteSchedule,
  FailedFetchNextDose,
  FailedFetchSchedules,
  FailedSaveSchedule,
  SchedulePhaseForm,
  SucceededActivateSchedule,
  SucceededDeleteSchedule,
  SucceededFetchNextDose,
  SucceededFetchSchedules,
  SucceededSaveSchedule,
} from './model.js'

// ============================================
// Commands
// ============================================

export const FetchSchedules = Command.define('FetchSchedules', {
  messages: [SucceededFetchSchedules, FailedFetchSchedules],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const schedules = yield* api.ScheduleList()

    return SucceededFetchSchedules({ schedules })
  }).pipe(toCommandResult(FailedFetchSchedules, 'Failed to load schedules')),
})

export const FetchNextDose = Command.define('FetchNextDose', {
  args: { requestKey: Schema.Int, requestedTimezone: IanaTimezone },
  messages: [SucceededFetchNextDose, FailedFetchNextDose],
  execute: ({ requestKey, requestedTimezone }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const result = yield* api.ScheduleGetNextDose()

      return SucceededFetchNextDose({
        nextDose: result.nextDose,
        requestKey,
        requestedTimezone,
        timezone: result.timezone,
      })
    }).pipe(
      Effect.tapError((cause) => Effect.logDebug('FetchNextDose failed', { error: cause })),
      Effect.orElseSucceed(() =>
        FailedFetchNextDose({ message: 'Failed to load next dose', requestKey, requestedTimezone })
      )
    ),
})

export const OpenScheduleForm = Command.define('OpenScheduleForm', {
  args: { schedule: Schema.NullOr(InjectionSchedule), timezone: IanaTimezone },
  messages: [CompletedOpenScheduleForm],
  execute: ({ schedule, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenScheduleForm({ schedule, todayLocal: utcToLocalDateString(now, timezone) }))
    ),
})

export const SaveSchedule = Command.define('SaveSchedule', {
  args: {
    editingId: Schema.NullOr(InjectionScheduleId),
    name: Schema.String,
    drug: Schema.String,
    supplier: Schema.String,
    frequency: Frequency,
    startDate: CalendarDate,
    notes: Schema.String,
    phases: Schema.Array(SchedulePhaseForm),
  },
  messages: [SucceededSaveSchedule, FailedSaveSchedule],
  execute: ({ drug, editingId, frequency, name, notes, phases, startDate, supplier }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const compound = yield* Schema.decodeUnknownEffect(MedicationCompound)(drug)

      const phaseCreates = yield* Effect.forEach(
        phases,
        (phase, index) =>
          Schema.decodeEffect(DoseMg)(Number(phase.doseMg)).pipe(
            Effect.map((doseMg) =>
              SchedulePhaseCreate.make({
                doseMg,
                durationDays: phase.isIndefinite
                  ? null
                  : PhaseDurationDays.make(Math.trunc(Number(phase.durationDays))),
                order: PhaseOrder.make(index + 1),
              })
            )
          ),
        { concurrency: 1 }
      )

      yield* editingId === null
        ? api.ScheduleCreate(
            InjectionScheduleCreate.make({
              drug: compound,
              frequency,
              name: ScheduleName.make(Str.trim(name)),
              notes: Str.trim(notes) === '' ? Option.none<Notes>() : Option.some(Notes.make(Str.trim(notes))),
              phases: phaseCreates,
              supplier:
                Str.trim(supplier) === '' ? Option.none<Supplier>() : Option.some(Supplier.make(Str.trim(supplier))),
              startDate,
            })
          )
        : api.ScheduleUpdate(
            InjectionScheduleUpdate.make({
              drug: compound,
              frequency,
              id: editingId,
              name: ScheduleName.make(Str.trim(name)),
              notes: Str.trim(notes) === '' ? null : Notes.make(Str.trim(notes)),
              phases: phaseCreates,
              supplier: Str.trim(supplier) === '' ? null : Supplier.make(Str.trim(supplier)),
              startDate,
            })
          )

      return SucceededSaveSchedule()
    }).pipe(toCommandResult(FailedSaveSchedule, 'Failed to save schedule')),
})

export const DeleteSchedule = Command.define('DeleteSchedule', {
  args: { id: InjectionScheduleId },
  messages: [SucceededDeleteSchedule, FailedDeleteSchedule],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.ScheduleDelete(InjectionScheduleDelete.make({ id }))

      return SucceededDeleteSchedule()
    }).pipe(toCommandResult(FailedDeleteSchedule, 'Failed to delete schedule')),
})

export const ActivateSchedule = Command.define('ActivateSchedule', {
  args: { id: InjectionScheduleId },
  messages: [SucceededActivateSchedule, FailedActivateSchedule],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.ScheduleUpdate(InjectionScheduleUpdate.make({ id, isActive: true }))

      return SucceededActivateSchedule()
    }).pipe(toCommandResult(FailedActivateSchedule, 'Failed to activate schedule')),
})
