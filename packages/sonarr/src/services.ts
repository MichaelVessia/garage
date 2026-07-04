import { makeConfigReaders } from '@garage/cli-protocol'
import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Option from 'effect/Option'

import { decodeError, envMissing } from './errors.js'
import type { SonarrError } from './errors.js'
import type {
  AddSeriesApiOptions,
  EpisodeRecord,
  HistoryRecord,
  ListResult,
  QualityProfile,
  QueueRecord,
  RootFolder,
  SeriesLookupResult,
  SeriesRecord,
  SonarrConfigValue,
  SystemStatus,
} from './model.js'

export class SonarrConfig extends Context.Service<
  SonarrConfig,
  {
    readonly get: () => Effect.Effect<SonarrConfigValue, SonarrError>
  }
>()('@garage/sonarr/services/SonarrConfig') {}

export class SonarrApi extends Context.Service<
  SonarrApi,
  {
    readonly status: () => Effect.Effect<SystemStatus, SonarrError>
    readonly rootFolders: () => Effect.Effect<ReadonlyArray<RootFolder>, SonarrError>
    readonly qualityProfiles: () => Effect.Effect<ReadonlyArray<QualityProfile>, SonarrError>
    readonly lookupSeries: (query: string) => Effect.Effect<ReadonlyArray<SeriesLookupResult>, SonarrError>
    readonly lookupSeriesByTvdbId: (tvdbId: number) => Effect.Effect<Option.Option<SeriesLookupResult>, SonarrError>
    readonly getSeriesByTvdbId: (tvdbId: number) => Effect.Effect<Option.Option<SeriesRecord>, SonarrError>
    readonly addSeries: (
      lookup: SeriesLookupResult,
      options: AddSeriesApiOptions
    ) => Effect.Effect<SeriesRecord, SonarrError>
    readonly removeSeries: (
      seriesId: number,
      options: { readonly deleteFiles: boolean }
    ) => Effect.Effect<void, SonarrError>
    readonly queue: (limit: number) => Effect.Effect<ListResult<QueueRecord>, SonarrError>
    readonly calendar: (days: number) => Effect.Effect<ReadonlyArray<EpisodeRecord>, SonarrError>
    readonly missing: (limit: number) => Effect.Effect<ListResult<EpisodeRecord>, SonarrError>
    readonly history: (limit: number) => Effect.Effect<ListResult<HistoryRecord>, SonarrError>
  }
>()('@garage/sonarr/services/SonarrApi') {}

const { readRequiredString, readRequiredSecret } = makeConfigReaders(envMissing)

const loadConfig = Effect.fn('SonarrConfig.get')(
  function* () {
    const url = yield* readRequiredString('SONARR_URL')
    const apiKey = yield* readRequiredSecret('SONARR_API_KEY')
    const defaultQualityProfileId = yield* Config.int('SONARR_DEFAULT_QUALITY_PROFILE').pipe(
      Config.withDefault(1),
      Effect.mapError((error) => decodeError(error.message, error))
    )

    return { url, apiKey, defaultQualityProfileId }
  },
  Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrConfig', method: 'get' })
)

export const SonarrConfigLive = Layer.effect(
  SonarrConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(loadConfig())
    return SonarrConfig.of({ get: () => cachedGet })
  })
)
