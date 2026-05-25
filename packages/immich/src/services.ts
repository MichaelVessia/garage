import { Config, Context, Effect, Layer, Schema } from 'effect'

import { envMissing } from './errors.js'
import type { ImmichError } from './errors.js'
import type {
  AlbumInfo,
  AlbumInfoOptions,
  AlbumSummary,
  CurrentUser,
  ImmichConfigValue,
  JobRecord,
  LimitOptions,
  ListResult,
  PeopleResult,
  PersonRecord,
  SearchOptions,
  SearchResult,
  Statistics,
  StorageStatus,
  SystemStatus,
  TagRecord,
  UsersResult,
} from './model.js'

export class ImmichConfig extends Context.Service<
  ImmichConfig,
  { readonly get: () => Effect.Effect<ImmichConfigValue, ImmichError> }
>()('@garage/immich/services/ImmichConfig') {}

export class ImmichApi extends Context.Service<
  ImmichApi,
  {
    readonly status: () => Effect.Effect<SystemStatus, ImmichError>
    readonly stats: () => Effect.Effect<Statistics, ImmichError>
    readonly storage: () => Effect.Effect<StorageStatus, ImmichError>
    readonly users: () => Effect.Effect<UsersResult, ImmichError>
    readonly me: () => Effect.Effect<CurrentUser, ImmichError>
    readonly albums: (options: LimitOptions) => Effect.Effect<ListResult<AlbumSummary>, ImmichError>
    readonly albumInfo: (options: AlbumInfoOptions) => Effect.Effect<AlbumInfo, ImmichError>
    readonly search: (options: SearchOptions) => Effect.Effect<SearchResult, ImmichError>
    readonly recent: (options: LimitOptions) => Effect.Effect<SearchResult, ImmichError>
    readonly people: (options: LimitOptions) => Effect.Effect<PeopleResult, ImmichError>
    readonly personInfo: (personId: string) => Effect.Effect<PersonRecord, ImmichError>
    readonly jobs: () => Effect.Effect<ListResult<JobRecord>, ImmichError>
    readonly tags: () => Effect.Effect<ListResult<TagRecord>, ImmichError>
  }
>()('@garage/immich/services/ImmichApi') {}

const readRequiredString = (name: string): Effect.Effect<string, ImmichError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

const readRequiredSecret = (name: string) =>
  Config.schema(Schema.Redacted(Schema.NonEmptyString), name).pipe(Effect.mapError(() => envMissing(name)))

export const ImmichConfigLive = Layer.effect(
  ImmichConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(
      Effect.gen(function* () {
        const url = yield* readRequiredString('IMMICH_URL')
        const apiKey = yield* readRequiredSecret('IMMICH_API_KEY')
        return { url, apiKey }
      }).pipe(
        Effect.withSpan('ImmichConfig.get'),
        Effect.annotateLogs({ package: '@garage/immich', service: 'ImmichConfig', method: 'get' })
      )
    )
    return ImmichConfig.of({ get: () => cachedGet })
  })
)
