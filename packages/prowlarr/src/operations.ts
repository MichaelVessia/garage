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
import { ProwlarrApi } from './services.js'
import type { ProwlarrConfig } from './services.js'

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
    const api = yield* ProwlarrApi
    return yield* api.status()
  }
).pipe(Effect.withSpan('prowlarr.status'), Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'status' }))

export const health: (
  options?: LimitOptions
) => Effect.Effect<ListResult<HealthRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.fn(
  'prowlarr.health'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<HealthRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'prowlarr.limit': limitOptions.limit })
    const api = yield* ProwlarrApi
    return toListResult(yield* api.health(), limitOptions.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'health' })
)

export const indexers: (
  options?: LimitOptions
) => Effect.Effect<ListResult<IndexerRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.fn(
  'prowlarr.indexers'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<IndexerRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'prowlarr.limit': limitOptions.limit })
    const api = yield* ProwlarrApi
    return toListResult(yield* api.indexers(), limitOptions.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'indexers' })
)

export const indexerStats: (
  options?: LimitOptions
) => Effect.Effect<ListResult<IndexerStatsRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.fn(
  'prowlarr.indexerStats'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<IndexerStatsRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'prowlarr.limit': limitOptions.limit })
    const api = yield* ProwlarrApi
    return toListResult(yield* api.indexerStats(), limitOptions.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'indexerStats' })
)

export const search: (
  query: string,
  options?: SearchOptions
) => Effect.Effect<SearchResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.fn('prowlarr.search')(
  function* (
    query: string,
    options?: SearchOptions
  ): Effect.fn.Return<SearchResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    const searchOptions = options ?? defaultSearchOptions
    yield* Effect.annotateCurrentSpan({ 'prowlarr.query_length': query.length, 'prowlarr.limit': searchOptions.limit })
    const api = yield* ProwlarrApi
    const searchType = searchOptions.type ?? 'search'
    const records = yield* api.search(query, { ...searchOptions, type: searchType })
    return searchResult(query, searchType, records, searchOptions.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'search' })
)

export const tvSearch = Effect.fn('prowlarr.tvSearch')(
  function* (options: TvSearchOptions): Effect.fn.Return<SearchResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    yield* Effect.annotateCurrentSpan({ 'prowlarr.type': 'tvsearch', 'prowlarr.limit': options.limit })
    const api = yield* ProwlarrApi
    const query = tvSearchQuery(options)
    const records = yield* api.search(query, { limit: options.limit, type: 'tvsearch' })
    return searchResult(query, 'tvsearch', records, options.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'tvSearch' })
)

export const movieSearch = Effect.fn('prowlarr.movieSearch')(
  function* (options: MovieSearchOptions): Effect.fn.Return<SearchResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    yield* Effect.annotateCurrentSpan({ 'prowlarr.type': 'movie', 'prowlarr.limit': options.limit })
    const api = yield* ProwlarrApi
    const query = movieSearchQuery(options)
    const records = yield* api.search(query, { limit: options.limit, type: 'movie' })
    return searchResult(query, 'movie', records, options.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'movieSearch' })
)

export const testIndexer = Effect.fn('prowlarr.testIndexer')(
  function* (indexerId: number): Effect.fn.Return<IndexerTestResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    yield* Effect.annotateCurrentSpan({ 'prowlarr.indexer_id': indexerId })
    const api = yield* ProwlarrApi
    return yield* api.testIndexer(indexerId)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'testIndexer' })
)

export const applications: (
  options?: LimitOptions
) => Effect.Effect<ListResult<ApplicationRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.fn(
  'prowlarr.applications'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<ApplicationRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'prowlarr.limit': limitOptions.limit })
    const api = yield* ProwlarrApi
    return toListResult(yield* api.applications(), limitOptions.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'applications' })
)

export const sync: Effect.Effect<CommandResult, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.gen(function* () {
  const api = yield* ProwlarrApi
  return yield* api.sync()
}).pipe(Effect.withSpan('prowlarr.sync'), Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'sync' }))

export const history: (
  options?: LimitOptions
) => Effect.Effect<ListResult<HistoryRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> = Effect.fn(
  'prowlarr.history'
)(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<HistoryRecord>, ProwlarrError, ProwlarrApi | ProwlarrConfig> {
    const limitOptions = options ?? defaultHistoryOptions
    yield* Effect.annotateCurrentSpan({ 'prowlarr.history_limit': limitOptions.limit })
    const api = yield* ProwlarrApi
    return yield* api.history(limitOptions.limit)
  },
  Effect.annotateLogs({ package: '@garage/prowlarr', operation: 'history' })
)
