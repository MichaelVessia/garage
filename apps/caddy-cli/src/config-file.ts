import { JsonObject, decodeError } from '@garage/caddy'
import type { CaddyError } from '@garage/caddy'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

export class CaddyConfigFile extends Context.Service<
  CaddyConfigFile,
  { readonly read: (path: string) => Effect.Effect<JsonObject, CaddyError> }
>()('@garage/caddy-cli/config-file/CaddyConfigFile') {}

export const CaddyConfigFileLive = Layer.effect(
  CaddyConfigFile,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    return CaddyConfigFile.of({
      read: Effect.fn('CaddyConfigFile.read')(function* (path) {
        const source = yield* fs
          .readFileString(path)
          .pipe(Effect.mapError((cause) => decodeError(`Could not read Caddy config file ${path}: ${cause.message}`)))

        return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(JsonObject))(source).pipe(
          Effect.mapError((issue) => decodeError(issue.message, issue))
        )
      }),
    })
  })
)
