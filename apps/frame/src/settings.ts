import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { IanaTimezone } from '#shared'

/** The household timezone that local dates, all-day events, and floating times use. */
export class FrameTimezone extends Context.Service<FrameTimezone, { readonly timezone: IanaTimezone }>()(
  '@garage/frame/settings/FrameTimezone'
) {}

export const FrameTimezoneLive = Layer.effect(
  FrameTimezone,
  Config.schema(IanaTimezone, 'FRAME_TIMEZONE').pipe(
    Config.withDefault(IanaTimezone.make('America/New_York')),
    Effect.map((timezone) => FrameTimezone.of({ timezone }))
  )
)
