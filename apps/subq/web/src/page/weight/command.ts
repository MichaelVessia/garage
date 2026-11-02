import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'

import {
  IanaTimezone,
  Limit,
  Notes,
  Offset,
  Weight,
  WeightLog,
  WeightLogCreate,
  WeightLogId,
  WeightLogListParams,
  WeightLogUpdate,
} from '#shared'

import { Api } from '../../api.js'
import { toCommandResult } from '../../lib/command.js'
import { utcToLocalDatetimeString } from '../../lib/datetime.js'
import {
  CompletedOpenWeightForm,
  FailedDeleteWeight,
  FailedFetchWeightLogs,
  FailedSaveWeight,
  SucceededDeleteWeight,
  SucceededFetchWeightLogs,
  SucceededSaveWeight,
} from './model.js'

// ============================================
// Commands
// ============================================

export const FetchWeightLogs = Command.define('FetchWeightLogs', {
  messages: [SucceededFetchWeightLogs, FailedFetchWeightLogs],
  execute: Effect.gen(function* () {
    const api = yield* Api

    const logs = yield* api.WeightLogList(
      WeightLogListParams.make({ limit: Limit.make(10_000), offset: Offset.make(0) })
    )

    return SucceededFetchWeightLogs({ logs })
  }).pipe(toCommandResult(FailedFetchWeightLogs, 'Failed to load weight logs')),
})

// Opening the form needs "now" for the datetime default and max.
export const OpenWeightForm = Command.define('OpenWeightForm', {
  args: { log: Schema.NullOr(WeightLog), timezone: IanaTimezone },
  messages: [CompletedOpenWeightForm],
  execute: ({ log, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenWeightForm({ log, nowLocal: utcToLocalDatetimeString(now, timezone) }))
    ),
})

export const SaveWeight = Command.define('SaveWeight', {
  args: {
    editingId: Schema.NullOr(WeightLogId),
    datetime: Schema.DateTimeUtc,
    weightLbs: Schema.Finite,
    notes: Schema.String,
  },
  messages: [SucceededSaveWeight, FailedSaveWeight],
  execute: ({ datetime, editingId, notes, weightLbs }) =>
    Effect.gen(function* () {
      const api = yield* Api

      const fields = {
        datetime,
        notes: notes === '' ? Option.none<Notes>() : Option.some(Notes.make(notes)),
        weight: Weight.make(weightLbs),
      }

      yield* editingId === null
        ? api.WeightLogCreate(WeightLogCreate.make(fields))
        : api.WeightLogUpdate(WeightLogUpdate.make({ id: editingId, ...fields }))

      return SucceededSaveWeight()
    }).pipe(toCommandResult(FailedSaveWeight, 'Failed to save entry')),
})

export const DeleteWeight = Command.define('DeleteWeight', {
  args: { id: WeightLogId },
  messages: [SucceededDeleteWeight, FailedDeleteWeight],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const api = yield* Api
      yield* api.WeightLogDelete({ id })

      return SucceededDeleteWeight()
    }).pipe(toCommandResult(FailedDeleteWeight, 'Failed to delete entry')),
})
