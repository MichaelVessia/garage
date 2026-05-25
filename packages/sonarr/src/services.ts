import type { Option } from 'effect'
import { Config, Context, Effect, Layer, Schema } from 'effect'

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

const readRequiredString = (name: string): Effect.Effect<string, SonarrError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

const readRequiredSecret = (name: string) =>
  Config.schema(Schema.Redacted(Schema.NonEmptyString), name).pipe(Effect.mapError(() => envMissing(name)))

export const SonarrConfigLive = Layer.effect(
  SonarrConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(
      Effect.gen(function* () {
        const url = yield* readRequiredString('SONARR_URL')
        const apiKey = yield* readRequiredSecret('SONARR_API_KEY')
        const defaultQualityProfileId = yield* Config.int('SONARR_DEFAULT_QUALITY_PROFILE').pipe(
          Config.withDefault(1),
          Effect.mapError((error) => decodeError(error.message, error))
        )

        return { url, apiKey, defaultQualityProfileId }
      }).pipe(
        Effect.withSpan('SonarrConfig.get'),
        Effect.annotateLogs({ package: '@garage/sonarr', service: 'SonarrConfig', method: 'get' })
      )
    )
    return SonarrConfig.of({ get: () => cachedGet })
  })
)
