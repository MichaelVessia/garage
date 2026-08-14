import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

const ModelDefaultSettings = Schema.Struct({
  defaultProvider: Schema.String,
  defaultModel: Schema.String,
})

const decodeModelDefaultSettings = Schema.decodeUnknownOption(Schema.fromJsonString(ModelDefaultSettings))
const encodeJsonString = Schema.encodeSync(Schema.fromJsonString(Schema.String))

const defaultProviderPattern = /("defaultProvider"\s*:\s*)"(?:\\.|[^"\\])*"/u
const defaultModelPattern = /("defaultModel"\s*:\s*)"(?:\\.|[^"\\])*"/u

/** The persisted provider and model that new Pi sessions should select. */
export interface ModelDefault {
  readonly provider: string
  readonly model: string
}

/** Decode a configured default model from a Pi settings document. */
export const decodeModelDefault = (source: string): Option.Option<ModelDefault> =>
  decodeModelDefaultSettings(source).pipe(
    Option.map(({ defaultModel, defaultProvider }) => ({
      provider: defaultProvider,
      model: defaultModel,
    }))
  )

/** Restore default-model fields while preserving every other Pi setting. */
export const restoreModelDefault = (source: string, configuredDefault: ModelDefault): Option.Option<string> =>
  decodeModelDefaultSettings(source).pipe(
    Option.map(() =>
      source
        .replace(
          defaultProviderPattern,
          (_match, prefix: string) => `${prefix}${encodeJsonString(configuredDefault.provider)}`
        )
        .replace(
          defaultModelPattern,
          (_match, prefix: string) => `${prefix}${encodeJsonString(configuredDefault.model)}`
        )
    )
  )

/** Read the default model captured when a Pi session starts. */
export const loadModelDefault = Effect.fn('PiExtensions.SessionModelDefault.loadModelDefault')(function* (
  agentDirectory: string
): Effect.fn.Return<Option.Option<ModelDefault>, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* fileSystem.readFileString(path.join(agentDirectory, 'settings.json')).pipe(
    Effect.map(decodeModelDefault),
    Effect.tapError((error) => Effect.logDebug('Could not read the configured Pi model default', { error })),
    Effect.orElseSucceed(() => Option.none())
  )
})

/** Rewrite only Pi's default-model fields after a session-local model cycle. */
export const persistModelDefault = Effect.fn('PiExtensions.SessionModelDefault.persistModelDefault')(function* (
  agentDirectory: string,
  configuredDefault: ModelDefault
): Effect.fn.Return<void, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const settingsPath = path.join(agentDirectory, 'settings.json')

  yield* fileSystem.readFileString(settingsPath).pipe(
    Effect.flatMap((source) =>
      restoreModelDefault(source, configuredDefault).pipe(
        Option.match({
          onNone: () => Effect.logWarning('Could not decode Pi settings while restoring the default model'),
          onSome: (restored) => fileSystem.writeFileString(settingsPath, restored),
        })
      )
    ),
    Effect.tapError((error) => Effect.logWarning('Could not preserve the configured Pi model default', { error })),
    Effect.ignore
  )
})
