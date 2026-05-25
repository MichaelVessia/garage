import { Config, Context, Effect, Layer } from 'effect'

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

export const ProwlarrConfigLive = Layer.succeed(ProwlarrConfig, {
  get: Effect.fn('ProwlarrConfig.get')(
    function* () {
      const url = yield* readRequiredString('PROWLARR_URL')
      const apiKey = yield* readRequiredString('PROWLARR_API_KEY')

      return { url, apiKey }
    },
    Effect.annotateLogs({ package: '@garage/prowlarr', service: 'ProwlarrConfig', method: 'get' })
  ),
})
