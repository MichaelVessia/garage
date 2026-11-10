import * as Config from 'effect/Config'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

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

/**
 * Adds the dotenv file named by `FRAME_ENV_FILE` as a configuration source behind the process
 * environment. The deployed container mounts the frame host's env file there, so credentials stay
 * on the host.
 */
export const FrameEnvFileLive = Layer.unwrap(
  Config.NonEmptyString('FRAME_ENV_FILE').pipe(
    Config.option,
    Effect.map(
      Option.match({
        onNone: () => Layer.empty,
        onSome: (path) =>
          ConfigProvider.layerAdd(
            FileSystem.FileSystem.pipe(
              Effect.flatMap((fs) => fs.readFileString(path)),
              Effect.map((contents) => ConfigProvider.fromDotEnvContents(contents))
            )
          ),
      })
    )
  )
)
