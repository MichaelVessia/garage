import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'

import {
  DoseMg,
  IanaTimezone,
  InjectionLog,
  InjectionLogCreate,
  InjectionLogDelete,
  InjectionLogId,
  InjectionLogListParams,
  InjectionLogUpdate,
  InjectionScheduleId,
  InjectionSite,
  Limit,
  MedicationCompound,
  Notes,
  Offset,
  Supplier,
} from '#shared'

import { Api } from '../../api.js'
import { toCommandResult } from '../../lib/command.js'
import { utcToLocalDatetimeString } from '../../lib/datetime.js'
import {
  CompletedOpenInjectionForm,
  FailedDeleteInjection,
  FailedFetchInjectionLogs,
  FailedFetchInjectionSchedules,
  FailedFetchInjectionSites,
  FailedSaveInjection,
  SucceededDeleteInjection,
  SucceededFetchInjectionLogs,
  SucceededFetchInjectionSchedules,
  SucceededFetchInjectionSites,
  SucceededSaveInjection,
} from './model.js'

// ============================================
// Commands
// ============================================

export const FetchInjectionLogs = Command.define('FetchInjectionLogs', {
  messages: [SucceededFetchInjectionLogs, FailedFetchInjectionLogs],
  execute: Effect.gen(function* () {
    const api = yield* Api

    const logs = yield* api.InjectionLogList(
      InjectionLogListParams.make({ limit: Limit.make(10_000), offset: Offset.make(0) })
    )

    return SucceededFetchInjectionLogs({ logs })
  }).pipe(toCommandResult(FailedFetchInjectionLogs, 'Failed to load injection logs')),
})

export const FetchInjectionSites = Command.define('FetchInjectionSites', {
  messages: [SucceededFetchInjectionSites, FailedFetchInjectionSites],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const sites = yield* api.InjectionLogGetSites()

    return SucceededFetchInjectionSites({ sites })
  }).pipe(toCommandResult(FailedFetchInjectionSites, 'Failed to load site suggestions')),
})

export const FetchInjectionSchedules = Command.define('FetchInjectionSchedules', {
  messages: [SucceededFetchInjectionSchedules, FailedFetchInjectionSchedules],
  execute: Effect.gen(function* () {
    const api = yield* Api
    const schedules = yield* api.ScheduleList()

    return SucceededFetchInjectionSchedules({ schedules })
  }).pipe(toCommandResult(FailedFetchInjectionSchedules, 'Failed to load schedules')),
})

export const OpenInjectionForm = Command.define('OpenInjectionForm', {
  args: { log: Schema.NullOr(InjectionLog), timezone: IanaTimezone },
  messages: [CompletedOpenInjectionForm],
  execute: ({ log, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenInjectionForm({ log, nowLocal: utcToLocalDatetimeString(now, timezone) }))
    ),
})

export const SaveInjection = Command.define('SaveInjection', {
  args: {
    editingId: Schema.NullOr(InjectionLogId),
    datetime: Schema.DateTimeUtc,
    drug: Schema.String,
    supplier: Schema.String,
    doseMg: Schema.String,
    injectionSite: Schema.String,
    notes: Schema.String,
    scheduleId: Schema.String,
  },
  messages: [SucceededSaveInjection, FailedSaveInjection],
  execute: ({ datetime, doseMg, drug, editingId, injectionSite, notes, scheduleId, supplier }) =>
    Effect.gen(function* () {
      const api = yield* Api
      const compound = yield* Schema.decodeUnknownEffect(MedicationCompound)(drug)
      const parsedDoseMg = yield* Schema.decodeEffect(DoseMg)(Number(doseMg))

      const fields = {
        datetime,
        doseMg: parsedDoseMg,
        drug: compound,
        injectionSite:
          injectionSite === '' ? Option.none<InjectionSite>() : Option.some(InjectionSite.make(injectionSite)),
        notes: notes === '' ? Option.none<Notes>() : Option.some(Notes.make(notes)),
        scheduleId:
          scheduleId === '' ? Option.none<InjectionScheduleId>() : Option.some(InjectionScheduleId.make(scheduleId)),
      }

      yield* editingId === null
        ? api.InjectionLogCreate(
            InjectionLogCreate.make({
              ...fields,
              supplier: supplier === '' ? Option.none<Supplier>() : Option.some(Supplier.make(supplier)),
            })
          )
        : api.InjectionLogUpdate(
            InjectionLogUpdate.make({
              id: editingId,
              ...fields,
              supplier: supplier === '' ? null : Supplier.make(supplier),
            })
          )

      return SucceededSaveInjection()
    }).pipe(toCommandResult(FailedSaveInjection, 'Failed to save injection log')),
})

export const DeleteInjection = Command.define('DeleteInjection', {
  args: { id: InjectionLogId },
  messages: [SucceededDeleteInjection, FailedDeleteInjection],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.InjectionLogDelete(InjectionLogDelete.make({ id }))

      return SucceededDeleteInjection()
    }).pipe(toCommandResult(FailedDeleteInjection, 'Failed to delete injection log')),
})

export type InjectionCommandMessage =
  | typeof SucceededFetchInjectionLogs.Type
  | typeof FailedFetchInjectionLogs.Type
  | typeof SucceededFetchInjectionSites.Type
  | typeof FailedFetchInjectionSites.Type
  | typeof SucceededFetchInjectionSchedules.Type
  | typeof FailedFetchInjectionSchedules.Type
  | typeof CompletedOpenInjectionForm.Type
  | typeof SucceededSaveInjection.Type
  | typeof FailedSaveInjection.Type
  | typeof SucceededDeleteInjection.Type
  | typeof FailedDeleteInjection.Type
