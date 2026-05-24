import { JsonObjectSchema, decodeError } from '@garage/caddy'
import type { CaddyError, JsonObject } from '@garage/caddy'
import { Context, Effect, Layer, Schema } from 'effect'

export class CaddyConfigFile extends Context.Service<
  CaddyConfigFile,
  { readonly read: (path: string) => Effect.Effect<JsonObject, CaddyError> }
>()('@garage/caddy-cli/config-file/CaddyConfigFile') {}

const readJson = (path: string): Promise<unknown> => Bun.file(path).json()

export const CaddyConfigFileLive = Layer.succeed(CaddyConfigFile, {
  read: (path) =>
    Effect.tryPromise(() => readJson(path)).pipe(
      Effect.mapError((cause) => decodeError(`Could not read Caddy config file ${path}: ${String(cause)}`)),
      Effect.flatMap((input) =>
        Schema.decodeUnknownEffect(JsonObjectSchema)(input).pipe(Effect.mapError((issue) => decodeError(issue.message)))
      )
    ),
})
