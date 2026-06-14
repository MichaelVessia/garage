import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'

import { envMissing } from './errors.js'
import type { ProwlarrError } from './errors.js'
import type {
  ApplicationRecord,
  CommandResult,
  HealthRecord,
  HistoryRecord,
  IndexerRecord,
  IndexerStatsRecord,
  IndexerTestResult,
  ListResult,
  ProwlarrConfigValue,
  ReleaseRecord,
  SearchOptions,
  SystemStatus,
} from './model.js'

export class ProwlarrConfig extends Context.Service<
  ProwlarrConfig,
  {
    readonly get: () => Effect.Effect<ProwlarrConfigValue, ProwlarrError>
  }
>()('@garage/prowlarr/services/ProwlarrConfig') {}

export class ProwlarrApi extends Context.Service<
  ProwlarrApi,
  {
    readonly status: () => Effect.Effect<SystemStatus, ProwlarrError>
    readonly health: () => Effect.Effect<ReadonlyArray<HealthRecord>, ProwlarrError>
    readonly indexers: () => Effect.Effect<ReadonlyArray<IndexerRecord>, ProwlarrError>
    readonly indexerStats: () => Effect.Effect<ReadonlyArray<IndexerStatsRecord>, ProwlarrError>
    readonly search: (
      query: string,
      options: SearchOptions
    ) => Effect.Effect<ReadonlyArray<ReleaseRecord>, ProwlarrError>
    readonly testIndexer: (indexerId: number) => Effect.Effect<IndexerTestResult, ProwlarrError>
    readonly applications: () => Effect.Effect<ReadonlyArray<ApplicationRecord>, ProwlarrError>
    readonly sync: () => Effect.Effect<CommandResult, ProwlarrError>
    readonly history: (limit: number) => Effect.Effect<ListResult<HistoryRecord>, ProwlarrError>
  }
>()('@garage/prowlarr/services/ProwlarrApi') {}

const readRequiredString = (name: string): Effect.Effect<string, ProwlarrError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

const readRequiredSecret = (name: string) =>
  Config.schema(Schema.Redacted(Schema.NonEmptyString), name).pipe(Effect.mapError(() => envMissing(name)))

const readConfig = Effect.fn('ProwlarrConfig.get')(
  function* () {
    const url = yield* readRequiredString('PROWLARR_URL')
    const apiKey = yield* readRequiredSecret('PROWLARR_API_KEY')

    return { url, apiKey }
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrConfig', method: 'get' })
)

export const ProwlarrConfigLive = Layer.effect(
  ProwlarrConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(readConfig())
    return ProwlarrConfig.of({ get: () => cachedGet })
  })
)
