import { IanaTimezone } from '@garage/subq-domain/Calendar'
import { WeightEntry } from '@garage/subq-domain/Journal/JournalRecords'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { Command } from 'foldkit'

import { utcToLocalDatetimeString } from '../../lib/datetime.ts'
import { CompletedOpenWeightForm } from './model.ts'

export const OpenWeightForm = Command.define('OpenWeightForm', {
  args: { log: Schema.NullOr(WeightEntry), timezone: IanaTimezone },
  messages: [CompletedOpenWeightForm],
  execute: ({ log, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenWeightForm({ log, nowLocal: utcToLocalDatetimeString(now, timezone) }))
    ),
})
