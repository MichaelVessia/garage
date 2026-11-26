import { Command } from '@effect/ui'
import { IanaTimezone } from '@garage/subq-domain/Calendar'
import { InjectionEntry } from '@garage/subq-domain/Journal/JournalRecords'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { utcToLocalDatetimeString } from '../../lib/datetime.ts'
import { CompletedOpenInjectionForm } from './model.ts'

export const OpenInjectionForm = Command.make(
  'OpenInjectionForm',
  { args: { log: Schema.NullOr(InjectionEntry), timezone: IanaTimezone } },
  ({ log, timezone }) =>
    DateTime.now.pipe(
      Effect.map((now) => CompletedOpenInjectionForm({ log, nowLocal: utcToLocalDatetimeString(now, timezone) }))
    )
)
