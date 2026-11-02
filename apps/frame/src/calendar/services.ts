import { makeConfigReaders } from '@garage/integration-http'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Redacted from 'effect/Redacted'

import type { CalendarEvent } from '#shared'

import { envMissing } from '../errors.js'
import type { CalendarError } from '../errors.js'
import type { InstantRange } from './ics.js'

/** The secret iCalendar address of the family calendar. */
export class CalendarConfig extends Context.Service<CalendarConfig, { readonly icsUrl: Redacted.Redacted }>()(
  '@garage/frame/calendar/services/CalendarConfig'
) {}

/** Occurrences of the family calendar inside an instant range. */
export class CalendarFeed extends Context.Service<
  CalendarFeed,
  {
    readonly occurrences: (range: InstantRange) => Effect.Effect<ReadonlyArray<CalendarEvent>, CalendarError>
  }
>()('@garage/frame/calendar/services/CalendarFeed') {}

const { readRequiredSecret } = makeConfigReaders(envMissing)

export const CalendarConfigLive: Layer.Layer<CalendarConfig, CalendarError> = Layer.effect(
  CalendarConfig,
  readRequiredSecret('CALENDAR_ICS_URL').pipe(Effect.map((icsUrl) => CalendarConfig.of({ icsUrl })))
)
