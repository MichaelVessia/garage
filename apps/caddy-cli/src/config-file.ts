import { JsonObjectSchema, decodeError } from '@garage/caddy'
import type { CaddyError, JsonObject } from '@garage/caddy'
import { Context, Effect, FileSystem, Layer, Schema } from 'effect'

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

        return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(JsonObjectSchema))(source).pipe(
          Effect.mapError((issue) => decodeError(issue.message, issue))
        )
      }),
    })
  })
)
