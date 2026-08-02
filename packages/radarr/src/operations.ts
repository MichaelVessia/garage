import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { notFound } from './errors.js'
import type { RadarrError } from './errors.js'
import type {
  AddCollectionMovieResult,
  AddCollectionOptions,
  AddCollectionResult,
  AddMovieOptions,
  AddMovieResult,
  CalendarOptions,
  CalendarResult,
  CollectionInfoResult,
  CollectionRecord,
  ConfigSummary,
  ExistsResult,
  HistoryRecord,
  LimitOptions,
  ListResult,
  MovieLookupResult,
  MovieRecord,
  MovieReleaseRecord,
  QualityProfile,
  QueueRecord,
  RemoveMovieOptions,
  RemoveMovieResult,
  SearchResult,
  SystemStatus,
} from './model.js'
import { RadarrApi, RadarrConfig } from './services.js'

export const defaultLimit = 10
export const defaultCalendarDays = 30
export const defaultAddCollectionResultLimit = 20

const defaultLimitOptions: LimitOptions = { limit: defaultLimit }
const defaultCalendarOptions: CalendarOptions = { days: defaultCalendarDays }
const defaultAddCollectionOptions: AddCollectionOptions = {
  searchForMovies: true,
  resultLimit: defaultAddCollectionResultLimit,
}

const take = <A>(items: ReadonlyArray<A>, limit: number): ReadonlyArray<A> => items.slice(0, limit)

const first = <A>(items: ReadonlyArray<A>): Option.Option<A> => {
  const [head] = items
  return head === undefined ? Option.none() : Option.some(head)
}

const markDefaultQualityProfile = (profile: QualityProfile, defaultQualityProfileId: number): QualityProfile => ({
  ...profile,
  isDefault: profile.id === defaultQualityProfileId,
})

const withQualityProfileName = (movie: MovieRecord, qualityProfiles: ReadonlyArray<QualityProfile>): MovieRecord => {
  const { qualityProfileId } = movie
  if (qualityProfileId === undefined) {
    return movie
  }

  const qualityProfile = qualityProfiles.find((profile) => profile.id === qualityProfileId)
  return qualityProfile === undefined ? movie : { ...movie, qualityProfileName: qualityProfile.name }
}

const collectionSearchTerm = (title: string): string => title.replace(/ Collection$/u, '')

const skippedCollectionMovie = (movie: MovieLookupResult): AddCollectionMovieResult => ({
  action: 'skipped',
  tmdbId: movie.tmdbId,
  title: movie.title,
  year: movie.year,
  reason: 'already in library',
})

const addedCollectionMovie = (movie: MovieRecord): AddCollectionMovieResult => ({
  action: 'added',
  tmdbId: movie.tmdbId,
  title: movie.title,
  year: movie.year,
  movieId: movie.id,
})

const failedCollectionMovie = (movie: MovieLookupResult, reason: string): AddCollectionMovieResult => ({
  action: 'failed',
  tmdbId: movie.tmdbId,
  title: movie.title,
  year: movie.year,
  reason,
})

const findCollection = (
  collections: ReadonlyArray<CollectionRecord>,
  tmdbId: number
): Option.Option<CollectionRecord> => first(collections.filter((collection) => collection.tmdbId === tmdbId))

export const status: Effect.Effect<SystemStatus, RadarrError, RadarrApi> = Effect.gen(function* () {
  const api = yield* RadarrApi
  return yield* api.status()
}).pipe(Effect.withSpan('radarr.status'), Effect.annotateLogs({ package: '@garage/radarr', operation: 'status' }))

export const config: Effect.Effect<ConfigSummary, RadarrError, RadarrApi | RadarrConfig> = Effect.gen(function* () {
  const radarrConfig = yield* RadarrConfig
  const values = yield* radarrConfig.get()
  const api = yield* RadarrApi
  const rootFolders = yield* api.rootFolders()
  const qualityProfiles = (yield* api.qualityProfiles()).map((profile) =>
    markDefaultQualityProfile(profile, values.defaultQualityProfileId)
  )

  return { rootFolders, qualityProfiles }
}).pipe(Effect.withSpan('radarr.config'), Effect.annotateLogs({ package: '@garage/radarr', operation: 'config' }))

export const search = Effect.fn('radarr.search')(
  function* (query: string, options?: LimitOptions): Effect.fn.Return<SearchResult, RadarrError, RadarrApi> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'radarr.query_length': query.length, 'radarr.limit': limitOptions.limit })
    const api = yield* RadarrApi
    const results = take(yield* api.lookupMovies(query), limitOptions.limit)

    return { query, count: results.length, results }
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'search' })
)

export const exists = Effect.fn('radarr.exists')(
  function* (tmdbId: number): Effect.fn.Return<ExistsResult, RadarrError, RadarrApi> {
    yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': tmdbId })
    const api = yield* RadarrApi
    const movie = yield* api.getMovieByTmdbId(tmdbId)

    return yield* Option.match(movie, {
      onNone: () => Effect.succeed({ tmdbId, exists: false }),
      onSome: (record) =>
        api.qualityProfiles().pipe(
          Effect.map((qualityProfiles) => ({
            tmdbId,
            exists: true,
            movie: withQualityProfileName(record, qualityProfiles),
          }))
        ),
    })
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'exists' })
)

export const addMovie = Effect.fn('radarr.addMovie')(
  function* (
    tmdbId: number,
    options: AddMovieOptions
  ): Effect.fn.Return<AddMovieResult, RadarrError, RadarrApi | RadarrConfig> {
    yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': tmdbId })
    const radarrConfig = yield* RadarrConfig
    const values = yield* radarrConfig.get()
    const api = yield* RadarrApi
    const lookup = yield* api.lookupMovieByTmdbId(tmdbId)
    const selected = yield* Option.match(lookup, {
      onNone: () => Effect.fail(notFound(`No Radarr lookup result found for TMDB ID ${tmdbId}`)),
      onSome: (record) => Effect.succeed(record),
    }).pipe(Effect.withSpan('radarr.selectLookupResult'))
    const rootFolder = yield* first(yield* api.rootFolders()).pipe(
      Option.match({
        onNone: () => Effect.fail(notFound('No Radarr root folders are configured')),
        onSome: (folder) => Effect.succeed(folder),
      }),
      Effect.withSpan('radarr.selectRootFolder')
    )
    const qualityProfileId = options.qualityProfileId ?? values.defaultQualityProfileId
    const movie = yield* api.addMovie(selected, {
      qualityProfileId,
      rootFolderPath: rootFolder.path,
      searchForMovie: options.searchForMovie,
    })

    return {
      added: true,
      movie,
      qualityProfileId,
      rootFolderPath: rootFolder.path,
      searchForMovie: options.searchForMovie,
    }
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'addMovie' })
)

export const collectionInfo = Effect.fn('radarr.collectionInfo')(
  function* (collectionTmdbId: number): Effect.fn.Return<CollectionInfoResult, RadarrError, RadarrApi> {
    yield* Effect.annotateCurrentSpan({ 'radarr.collection_id': collectionTmdbId })
    const api = yield* RadarrApi
    const collection = yield* findCollection(yield* api.collections(), collectionTmdbId).pipe(
      Option.match({
        onNone: () =>
          Effect.fail(
            notFound(`Collection TMDB ID ${collectionTmdbId} is not known to Radarr; add one movie from it first`)
          ),
        onSome: (record) => Effect.succeed(record),
      })
    )

    return { collection }
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'collectionInfo' })
)

export const addCollection: (
  collectionTmdbId: number,
  options?: AddCollectionOptions
) => Effect.Effect<AddCollectionResult, RadarrError, RadarrApi | RadarrConfig> = Effect.fn('radarr.addCollection')(
  function* (
    collectionTmdbId: number,
    options?: AddCollectionOptions
  ): Effect.fn.Return<AddCollectionResult, RadarrError, RadarrApi | RadarrConfig> {
    const addOptions = options ?? defaultAddCollectionOptions
    yield* Effect.annotateCurrentSpan({
      'radarr.collection_id': collectionTmdbId,
      'radarr.limit': addOptions.resultLimit,
    })
    const radarrConfig = yield* RadarrConfig
    const values = yield* radarrConfig.get()
    const api = yield* RadarrApi
    const collection = yield* findCollection(yield* api.collections(), collectionTmdbId).pipe(
      Option.match({
        onNone: () =>
          Effect.fail(
            notFound(`Collection TMDB ID ${collectionTmdbId} is not known to Radarr; add one movie from it first`)
          ),
        onSome: (record) => Effect.succeed(record),
      })
    )
    const movies = yield* api.lookupMovies(collectionSearchTerm(collection.title)).pipe(
      Effect.map((records) => records.filter((movie) => movie.collection?.tmdbId === collectionTmdbId)),
      Effect.withSpan('radarr.lookupCollectionMovies')
    )

    if (Arr.isReadonlyArrayEmpty(movies)) {
      return yield* notFound(`No movies found in collection ${collectionTmdbId}`)
    }

    const rootFolder = yield* first(yield* api.rootFolders()).pipe(
      Option.match({
        onNone: () => Effect.fail(notFound('No Radarr root folders are configured')),
        onSome: (folder) => Effect.succeed(folder),
      }),
      Effect.withSpan('radarr.selectRootFolder')
    )

    const addCollectionMovie = Effect.fn('radarr.addCollectionMovie')(function* (
      movie: MovieLookupResult
    ): Effect.fn.Return<AddCollectionMovieResult, RadarrError> {
      yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': movie.tmdbId })
      const existing = yield* api.getMovieByTmdbId(movie.tmdbId)

      return yield* Option.match(existing, {
        onNone: () =>
          api
            .addMovie(movie, {
              qualityProfileId: values.defaultQualityProfileId,
              rootFolderPath: rootFolder.path,
              searchForMovie: addOptions.searchForMovies,
            })
            .pipe(Effect.map(addedCollectionMovie)),
        onSome: () => Effect.succeed(skippedCollectionMovie(movie)),
      })
    })
    const records = yield* Effect.forEach(
      movies,
      (movie: MovieLookupResult) =>
        addCollectionMovie(movie).pipe(
          Effect.match({
            onFailure: (error) => failedCollectionMovie(movie, error.message),
            onSuccess: (result) => result,
          })
        ),
      { concurrency: 1 }
    )

    yield* api.setCollectionMonitoring(collection.id)

    const added = records.filter((record) => record.action === 'added').length
    const skipped = records.filter((record) => record.action === 'skipped').length
    const failed = records.filter((record) => record.action === 'failed').length
    const visibleRecords = take(records, addOptions.resultLimit)

    return {
      collectionTmdbId,
      title: collection.title,
      totalMovies: movies.length,
      added,
      skipped,
      failed,
      searchForMovies: addOptions.searchForMovies,
      monitored: true,
      searchOnAdd: true,
      records: visibleRecords,
      recordsTruncated: visibleRecords.length < records.length,
    }
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'addCollection' })
)

export const removeMovie = Effect.fn('radarr.removeMovie')(
  function* (tmdbId: number, options: RemoveMovieOptions): Effect.fn.Return<RemoveMovieResult, RadarrError, RadarrApi> {
    yield* Effect.annotateCurrentSpan({ 'radarr.tmdb_id': tmdbId, 'radarr.delete_files': options.deleteFiles })
    const api = yield* RadarrApi
    const movie = yield* api.getMovieByTmdbId(tmdbId)
    const selected = yield* Option.match(movie, {
      onNone: () => Effect.fail(notFound(`Movie with TMDB ID ${tmdbId} is not in the Radarr library`)),
      onSome: (record) => Effect.succeed(record),
    }).pipe(Effect.withSpan('radarr.selectMovie'))

    yield* api.removeMovie(selected.id, { deleteFiles: options.deleteFiles })

    return { removed: true, tmdbId, deleteFiles: options.deleteFiles }
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'removeMovie' })
)

export const queue: (options?: LimitOptions) => Effect.Effect<ListResult<QueueRecord>, RadarrError, RadarrApi> =
  Effect.fn('radarr.queue')(
    function* (options?: LimitOptions): Effect.fn.Return<ListResult<QueueRecord>, RadarrError, RadarrApi> {
      const limitOptions = options ?? defaultLimitOptions
      yield* Effect.annotateCurrentSpan({ 'radarr.limit': limitOptions.limit })
      const api = yield* RadarrApi
      const result = yield* api.queue(limitOptions.limit)
      const records = take(result.records, limitOptions.limit)
      return { count: records.length, totalRecords: result.totalRecords, records }
    },
    Effect.annotateLogs({ package: '@garage/radarr', operation: 'queue' })
  )

export const calendar: (options?: CalendarOptions) => Effect.Effect<CalendarResult, RadarrError, RadarrApi> = Effect.fn(
  'radarr.calendar'
)(
  function* (options?: CalendarOptions): Effect.fn.Return<CalendarResult, RadarrError, RadarrApi> {
    const calendarOptions = options ?? defaultCalendarOptions
    yield* Effect.annotateCurrentSpan({ 'radarr.days': calendarOptions.days })
    const api = yield* RadarrApi
    const records = yield* api.calendar(calendarOptions.days)
    return { days: calendarOptions.days, count: records.length, records }
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'calendar' })
)

export const missing: (
  options?: LimitOptions
) => Effect.Effect<ListResult<MovieReleaseRecord>, RadarrError, RadarrApi> = Effect.fn('radarr.missing')(
  function* (options?: LimitOptions): Effect.fn.Return<ListResult<MovieReleaseRecord>, RadarrError, RadarrApi> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'radarr.limit': limitOptions.limit })
    const api = yield* RadarrApi
    const result = yield* api.missing(limitOptions.limit)
    const records = take(result.records, limitOptions.limit)
    return { count: records.length, totalRecords: result.totalRecords, records }
  },
  Effect.annotateLogs({ package: '@garage/radarr', operation: 'missing' })
)

export const history: (options?: LimitOptions) => Effect.Effect<ListResult<HistoryRecord>, RadarrError, RadarrApi> =
  Effect.fn('radarr.history')(
    function* (options?: LimitOptions): Effect.fn.Return<ListResult<HistoryRecord>, RadarrError, RadarrApi> {
      const limitOptions = options ?? defaultLimitOptions
      yield* Effect.annotateCurrentSpan({ 'radarr.limit': limitOptions.limit })
      const api = yield* RadarrApi
      const result = yield* api.history(limitOptions.limit)
      const records = take(result.records, limitOptions.limit)
      return { count: records.length, totalRecords: result.totalRecords, records }
    },
    Effect.annotateLogs({ package: '@garage/radarr', operation: 'history' })
  )

export const firstTmdbId = (results: ReadonlyArray<MovieLookupResult>): Option.Option<number> =>
  first(results).pipe(Option.map((result) => result.tmdbId))
