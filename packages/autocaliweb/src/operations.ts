import { Effect } from 'effect'

import type { AutocaliwebError } from './errors.js'
import type {
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
} from './index.js'
import { AutocaliwebApi, AutocaliwebConfig } from './services.js'

export const defaultLimit = 50
const defaultLimitOptions: LimitOptions = { limit: defaultLimit }

const requireConfig = Effect.gen(function* () {
  const config = yield* AutocaliwebConfig
  yield* config.get
})

export const status: Effect.Effect<StatusResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* AutocaliwebApi
    return yield* api.status
  }
)

export const version: Effect.Effect<StatusResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = status

export const stats: Effect.Effect<StatsResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> = Effect.gen(
  function* () {
    yield* requireConfig
    const api = yield* AutocaliwebApi
    return yield* api.stats
  }
)

export const catalog: Effect.Effect<
  ListResult<CatalogEntry>,
  AutocaliwebError,
  AutocaliwebApi | AutocaliwebConfig
> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AutocaliwebApi
  return yield* api.catalog
})

export const books = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<BookRecord>, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AutocaliwebApi
    return yield* api.books(options)
  })

export const recent = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<BookRecord>, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AutocaliwebApi
    return yield* api.recent(options)
  })

export const search = (
  options: SearchOptions
): Effect.Effect<SearchResult, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AutocaliwebApi
    return yield* api.search(options)
  })

export const bookInfo = (
  options: BookInfoOptions
): Effect.Effect<BookInfoRecord, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig> =>
  Effect.gen(function* () {
    yield* requireConfig
    const api = yield* AutocaliwebApi
    return yield* api.bookInfo(options)
  })

export const shelves: Effect.Effect<
  ListResult<CatalogEntry>,
  AutocaliwebError,
  AutocaliwebApi | AutocaliwebConfig
> = Effect.gen(function* () {
  yield* requireConfig
  const api = yield* AutocaliwebApi
  return yield* api.shelves
})
