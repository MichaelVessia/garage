import { JsonObject, decodeError } from '@garage/caddy'
import type { CaddyError } from '@garage/caddy'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Schema from 'effect/Schema'

export const readCaddyConfigFile = Effect.fn('CaddyConfigFile.read')(function* (
  path: string
): Effect.fn.Return<JsonObject, CaddyError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs
    .readFileString(path)
    .pipe(Effect.mapError((cause) => decodeError(`Could not read Caddy config file ${path}: ${cause.message}`)))

  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(JsonObject))(source).pipe(
    Effect.mapError((issue) => decodeError(issue.message, issue))
  )
})
