import { Config, Context, Effect, Layer, Schema } from 'effect'

import { envMissing } from './errors.js'
import type { AutocaliwebError } from './errors.js'
import type {
  AutocaliwebConfigValue,
  BookInfoOptions,
  BookInfoRecord,
  BookRecord,
  CatalogEntry,
  LimitOptions,
  ListResult,
  SearchOptions,
  SearchResult,
  StatsResult,
  StatusResult,
} from './model.js'

export class AutocaliwebConfig extends Context.Service<
  AutocaliwebConfig,
  { readonly get: () => Effect.Effect<AutocaliwebConfigValue, AutocaliwebError> }
>()('@garage/autocaliweb/services/AutocaliwebConfig') {}

export class AutocaliwebApi extends Context.Service<
  AutocaliwebApi,
  {
    readonly status: () => Effect.Effect<StatusResult, AutocaliwebError>
    readonly stats: () => Effect.Effect<StatsResult, AutocaliwebError>
    readonly catalog: () => Effect.Effect<ListResult<CatalogEntry>, AutocaliwebError>
    readonly books: (options: LimitOptions) => Effect.Effect<ListResult<BookRecord>, AutocaliwebError>
    readonly recent: (options: LimitOptions) => Effect.Effect<ListResult<BookRecord>, AutocaliwebError>
    readonly search: (options: SearchOptions) => Effect.Effect<SearchResult, AutocaliwebError>
    readonly bookInfo: (options: BookInfoOptions) => Effect.Effect<BookInfoRecord, AutocaliwebError>
    readonly shelves: () => Effect.Effect<ListResult<CatalogEntry>, AutocaliwebError>
  }
>()('@garage/autocaliweb/services/AutocaliwebApi') {}

const readRequiredString = (name: string): Effect.Effect<string, AutocaliwebError> =>
  Config.nonEmptyString(name).pipe(Effect.mapError(() => envMissing(name)))

const readRequiredSecret = (name: string) =>
  Config.schema(Schema.Redacted(Schema.NonEmptyString), name).pipe(Effect.mapError(() => envMissing(name)))

export const AutocaliwebConfigLive = Layer.effect(
  AutocaliwebConfig,
  Effect.gen(function* () {
    const cachedGet = yield* Effect.cached(
      Effect.gen(function* () {
        const url = yield* readRequiredString('AUTOCALIWEB_URL')
        const username = yield* readRequiredString('AUTOCALIWEB_USERNAME')
        const password = yield* readRequiredSecret('AUTOCALIWEB_PASSWORD')
        return { url, username, password }
      }).pipe(
        Effect.withSpan('AutocaliwebConfig.get'),
        Effect.annotateLogs({ package: '@garage/autocaliweb', service: 'AutocaliwebConfig', method: 'get' })
      )
    )
    return AutocaliwebConfig.of({ get: () => cachedGet })
  })
)
