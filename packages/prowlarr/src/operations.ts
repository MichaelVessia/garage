import { Effect } from 'effect'

import type { ProwlarrError } from './errors.js'
import type {
  ApplicationRecord,
  CommandResult,
  HealthRecord,
  HistoryRecord,
  IndexerRecord,
  IndexerStatsRecord,
  IndexerTestResult,
  LimitOptions,
  ListResult,
  MovieSearchOptions,
  ReleaseRecord,
  SearchOptions,
  SearchResult,
  SystemStatus,
  TvSearchOptions,
} from './model.js'
import { ProwlarrApi, ProwlarrConfig } from './services.js'

export const defaultLimit = 10
export const defaultHistoryLimit = 50

const defaultLimitOptions: LimitOptions = { limit: defaultLimit }
const defaultSearchOptions: SearchOptions = { limit: defaultLimit }
const defaultHistoryOptions: LimitOptions = { limit: defaultHistoryLimit }

const take = <A>(items: ReadonlyArray<A>, limit: number): ReadonlyArray<A> => items.slice(0, limit)

const toListResult = <Record>(records: ReadonlyArray<Record>, limit: number): ListResult<Record> => {
  const visibleRecords = take(records, limit)
  return { count: visibleRecords.length, totalRecords: records.length, records: visibleRecords }
}

const searchResult = (
  query: string,
  type: string,
  records: ReadonlyArray<ReleaseRecord>,
  limit: number
): SearchResult => {
  const visibleRecords = take(records, limit)
  return { query, type, count: visibleRecords.length, totalRecords: records.length, records: visibleRecords }
}

const tvSearchQuery = (options: TvSearchOptions): string => {
  const chunks: Array<string> = [`{TvdbId:${options.tvdbId}}`]

  if (options.season !== undefined) {
    chunks.push(`{Season:${options.season}}`)
  }

  if (options.episode !== undefined) {
    chunks.push(`{Episode:${options.episode}}`)
  }

  return chunks.join(' ')
}

const movieSearchQuery = (options: MovieSearchOptions): string => {
  const chunks: Array<string> = []

  if (options.imdbId !== undefined) {
    chunks.push(`{ImdbId:${options.imdbId}}`)
  }

  if (options.tmdbId !== undefined) {
    chunks.push(`{TmdbId:${options.tmdbId}}`)
  }

  return chunks.join(' ')
}

export const status: Effect.Effect<SystemStatus, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.gen(
  function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    return yield* api.status
  }
)

export const health = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<HealthRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    return toListResult(yield* api.health, options.limit)
  })

export const indexers = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<IndexerRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    return toListResult(yield* api.indexers, options.limit)
  })

export const indexerStats = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<IndexerStatsRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    return toListResult(yield* api.indexerStats, options.limit)
  })

export const search = (
  query: string,
  options: SearchOptions = defaultSearchOptions
): Effect.Effect<SearchResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    const searchType = options.type ?? 'search'
    const records = yield* api.search(query, { ...options, type: searchType })
    return searchResult(query, searchType, records, options.limit)
  })

export const tvSearch = (
  options: TvSearchOptions
): Effect.Effect<SearchResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    const query = tvSearchQuery(options)
    const records = yield* api.search(query, { limit: options.limit, type: 'tvsearch' })
    return searchResult(query, 'tvsearch', records, options.limit)
  })

export const movieSearch = (
  options: MovieSearchOptions
): Effect.Effect<SearchResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    const query = movieSearchQuery(options)
    const records = yield* api.search(query, { limit: options.limit, type: 'movie' })
    return searchResult(query, 'movie', records, options.limit)
  })

export const testIndexer = (
  indexerId: number
): Effect.Effect<IndexerTestResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    return yield* api.testIndexer(indexerId)
  })

export const applications = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<ApplicationRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    return toListResult(yield* api.applications, options.limit)
  })

export const sync: Effect.Effect<CommandResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.gen(function* () {
  const config = yield* ProwlarrConfig
  yield* config.get
  const api = yield* ProwlarrApi
  return yield* api.sync
})

export const history = (
  options: LimitOptions = defaultHistoryOptions
): Effect.Effect<ListResult<HistoryRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> =>
  Effect.gen(function* () {
    const config = yield* ProwlarrConfig
    yield* config.get
    const api = yield* ProwlarrApi
    return yield* api.history(options.limit)
  })
