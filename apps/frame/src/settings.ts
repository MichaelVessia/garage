import * as Config from 'effect/Config'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { IanaTimezone } from '#shared'

/** The frame host's root-owned dotenv file with the server's credentials and settings. */
export const HOST_ENV_FILE = '/opt/garage-frame/frame.env'

/** Where the container sees `HOST_ENV_FILE`; the server reads it through `FRAME_ENV_FILE`. */
export const CONTAINER_ENV_FILE = '/run/garage-frame/frame.env'

/** The household timezone that local dates, all-day events, and floating times use. */
export class FrameTimezone extends Context.Service<FrameTimezone, { readonly timezone: IanaTimezone }>()(
  '@garage/frame/settings/FrameTimezone'
) {
  public static readonly make = Config.schema(IanaTimezone, 'FRAME_TIMEZONE').pipe(
    Config.withDefault(IanaTimezone.make('America/New_York')),
    Effect.map((timezone) => FrameTimezone.of({ timezone }))
  )

  public static readonly layer = Layer.effect(this, this.make)
}

export const FrameTimezoneLive = FrameTimezone.layer

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
