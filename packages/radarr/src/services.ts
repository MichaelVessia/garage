import type { Option } from 'effect'
import { Config, Context, Effect, Layer } from 'effect'

import { decodeError, envMissing } from './errors.js'
import type { RadarrError } from './errors.js'
import type {
  AddMovieApiOptions,
  CollectionRecord,
  HistoryRecord,
  ListResult,
  MovieLookupResult,
  MovieRecord,
  MovieReleaseRecord,
  QualityProfile,
  QueueRecord,
  RadarrConfigValue,
  RootFolder,
  SystemStatus,
} from './model.js'

export class RadarrConfig extends Context.Service<
  RadarrConfig,
  {
    readonly get: Effect.Effect<RadarrConfigValue, RadarrError>
  }
>()('@garage/radarr/services/RadarrConfig') {}

export class RadarrApi extends Context.Service<
  RadarrApi,
  {
    readonly status: Effect.Effect<SystemStatus, RadarrError>
    readonly rootFolders: Effect.Effect<ReadonlyArray<RootFolder>, RadarrError>
    readonly qualityProfiles: Effect.Effect<ReadonlyArray<QualityProfile>, RadarrError>
    readonly lookupMovies: (query: string) => Effect.Effect<ReadonlyArray<MovieLookupResult>, RadarrError>
    readonly lookupMovieByTmdbId: (tmdbId: number) => Effect.Effect<Option.Option<MovieLookupResult>, RadarrError>
    readonly getMovieByTmdbId: (tmdbId: number) => Effect.Effect<Option.Option<MovieRecord>, RadarrError>
    readonly addMovie: (
      lookup: MovieLookupResult,
      options: AddMovieApiOptions
    ) => Effect.Effect<MovieRecord, RadarrError>
    readonly removeMovie: (
      movieId: number,
      options: { readonly deleteFiles: boolean }
    ) => Effect.Effect<void, RadarrError>
    readonly collections: Effect.Effect<ReadonlyArray<CollectionRecord>, RadarrError>
    readonly setCollectionMonitoring: (collectionId: number) => Effect.Effect<void, RadarrError>
    readonly queue: (limit: number) => Effect.Effect<ListResult<QueueRecord>, RadarrError>
    readonly calendar: (days: number) => Effect.Effect<ReadonlyArray<MovieReleaseRecord>, RadarrError>
    readonly missing: (limit: number) => Effect.Effect<ListResult<MovieReleaseRecord>, RadarrError>
    readonly history: (limit: number) => Effect.Effect<ListResult<HistoryRecord>, RadarrError>
  }
>()('@garage/radarr/services/RadarrApi') {}

const readRequiredString = (name: string): Effect.Effect<string, RadarrError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

export const RadarrConfigLive = Layer.succeed(RadarrConfig, {
  get: Effect.gen(function* () {
    const url = yield* readRequiredString('RADARR_URL')
    const apiKey = yield* readRequiredString('RADARR_API_KEY')
    const defaultQualityProfileId = yield* Config.int('RADARR_DEFAULT_QUALITY_PROFILE').pipe(
      Config.withDefault(1),
      Effect.mapError((error) => decodeError(error.message))
    )

    return { url, apiKey, defaultQualityProfileId }
  }),
})
