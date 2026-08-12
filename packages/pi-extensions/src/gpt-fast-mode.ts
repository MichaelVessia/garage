import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as HashSet from 'effect/HashSet'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'

const CONFIG_FIELD = 'pi-gpt-fast-mode'

const supportedModels = HashSet.make(
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'openai/gpt-5.5',
  'openai/gpt-5.6',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-luna',
  'openai-codex/gpt-5.4',
  'openai-codex/gpt-5.4-mini',
  'openai-codex/gpt-5.5',
  'openai-codex/gpt-5.6',
  'openai-codex/gpt-5.6-sol',
  'openai-codex/gpt-5.6-terra',
  'openai-codex/gpt-5.6-luna'
)

const FastModeSettings = Schema.Struct({
  [CONFIG_FIELD]: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
    })
  ),
})

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
const decodeSettings = Schema.decodeUnknownOption(Schema.fromJsonString(FastModeSettings))
const decodeJsonObject = Schema.decodeUnknownOption(JsonObject)

/** The selected Pi model fields used by fast-mode policy. */
export interface SelectedModel {
  /** Pi provider identifier. */
  readonly provider: string
  /** Provider model identifier. */
  readonly id: string
}

/** Return whether a selected model supports OpenAI's priority service tier. */
export const isFastModeSupported = (model: Option.Option<SelectedModel>): boolean =>
  Option.exists(model, ({ id, provider }) => HashSet.has(supportedModels, `${provider}/${id}`))

/** Decode whether fast mode is enabled from the Pi settings JSON document. */
export const decodeConfiguredDefault = (source: string): boolean => {
  const settings = decodeSettings(source)
  return Option.isSome(settings) && settings.value[CONFIG_FIELD]?.enabled === true
}

/** Read fast mode's configured default, falling back to disabled for any read or decode failure. */
export const loadConfiguredDefault = Effect.fn('PiExtensions.GptFastMode.loadConfiguredDefault')(function* (
  agentDirectory: string
): Effect.fn.Return<boolean, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* fileSystem.readFileString(path.join(agentDirectory, 'settings.json')).pipe(
    Effect.map(decodeConfiguredDefault),
    Effect.tapError((error) =>
      Effect.logDebug('Could not read GPT fast-mode settings; defaulting to disabled', { error })
    ),
    Effect.orElseSucceed(() => false)
  )
})

/** Add the priority service tier when fast-mode request policy permits it. */
export const applyFastMode = (
  payload: unknown,
  model: Option.Option<SelectedModel>,
  enabled: boolean
): Option.Option<Readonly<Record<string, unknown>>> => {
  if (!enabled || !isFastModeSupported(model)) {
    return Option.none()
  }

  return Option.flatMap(model, (selected) => {
    const object = decodeJsonObject(payload)
    if (Option.isNone(object) || object.value.model !== selected.id) {
      return Option.none()
    }

    return Option.some({ ...object.value, service_tier: 'priority' })
  })
}
