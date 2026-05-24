import { Effect, Option } from 'effect'

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

export const status: Effect.Effect<SystemStatus, RadarrError, RadarrApi | RadarrConfig> = Effect.gen(function* () {
  const config = yield* RadarrConfig
  yield* config.get
  const api = yield* RadarrApi
  return yield* api.status
})

export const config: Effect.Effect<ConfigSummary, RadarrError, RadarrApi | RadarrConfig> = Effect.gen(function* () {
  const radarrConfig = yield* RadarrConfig
  const values = yield* radarrConfig.get
  const api = yield* RadarrApi
  const rootFolders = yield* api.rootFolders
  const qualityProfiles = (yield* api.qualityProfiles).map((profile) =>
    markDefaultQualityProfile(profile, values.defaultQualityProfileId)
  )

  return { rootFolders, qualityProfiles }
})

export const search = (
  query: string,
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<SearchResult, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const results = take(yield* api.lookupMovies(query), options.limit)

    return { query, count: results.length, results }
  })

export const exists = (tmdbId: number): Effect.Effect<ExistsResult, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const movie = yield* api.getMovieByTmdbId(tmdbId)

    return yield* Option.match(movie, {
      onNone: () => Effect.succeed({ tmdbId, exists: false }),
      onSome: (record) =>
        Effect.gen(function* () {
          const qualityProfiles = yield* api.qualityProfiles
          return { tmdbId, exists: true, movie: withQualityProfileName(record, qualityProfiles) }
        }),
    })
  })

export const addMovie = (
  tmdbId: number,
  options: AddMovieOptions
): Effect.Effect<AddMovieResult, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    const values = yield* radarrConfig.get
    const api = yield* RadarrApi
    const lookup = yield* api.lookupMovieByTmdbId(tmdbId)
    const selected = yield* Option.match(lookup, {
      onNone: () => Effect.fail(notFound(`No Radarr lookup result found for TMDB ID ${tmdbId}`)),
      onSome: (record) => Effect.succeed(record),
    })
    const rootFolder = yield* first(yield* api.rootFolders).pipe(
      Option.match({
        onNone: () => Effect.fail(notFound('No Radarr root folders are configured')),
        onSome: (folder) => Effect.succeed(folder),
      })
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
  })

export const collectionInfo = (
  collectionTmdbId: number
): Effect.Effect<CollectionInfoResult, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const collection = yield* findCollection(yield* api.collections, collectionTmdbId).pipe(
      Option.match({
        onNone: () =>
          Effect.fail(
            notFound(`Collection TMDB ID ${collectionTmdbId} is not known to Radarr; add one movie from it first`)
          ),
        onSome: (record) => Effect.succeed(record),
      })
    )

    return { collection }
  })

export const addCollection = (
  collectionTmdbId: number,
  options: AddCollectionOptions = defaultAddCollectionOptions
): Effect.Effect<AddCollectionResult, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    const values = yield* radarrConfig.get
    const api = yield* RadarrApi
    const collection = yield* findCollection(yield* api.collections, collectionTmdbId).pipe(
      Option.match({
        onNone: () =>
          Effect.fail(
            notFound(`Collection TMDB ID ${collectionTmdbId} is not known to Radarr; add one movie from it first`)
          ),
        onSome: (record) => Effect.succeed(record),
      })
    )
    const movies = (yield* api.lookupMovies(collectionSearchTerm(collection.title))).filter(
      (movie) => movie.collection?.tmdbId === collectionTmdbId
    )

    if (movies.length === 0) {
      return yield* notFound(`No movies found in collection ${collectionTmdbId}`)
    }

    const rootFolder = yield* first(yield* api.rootFolders).pipe(
      Option.match({
        onNone: () => Effect.fail(notFound('No Radarr root folders are configured')),
        onSome: (folder) => Effect.succeed(folder),
      })
    )

    const addCollectionMovie = (movie: MovieLookupResult): Effect.Effect<AddCollectionMovieResult, never> =>
      Effect.gen(function* () {
        const existing = yield* api.getMovieByTmdbId(movie.tmdbId)

        return yield* Option.match(existing, {
          onNone: () =>
            api
              .addMovie(movie, {
                qualityProfileId: values.defaultQualityProfileId,
                rootFolderPath: rootFolder.path,
                searchForMovie: options.searchForMovies,
              })
              .pipe(Effect.map(addedCollectionMovie)),
          onSome: () => Effect.succeed(skippedCollectionMovie(movie)),
        })
      }).pipe(
        Effect.match({
          onFailure: (error) => failedCollectionMovie(movie, error.message),
          onSuccess: (result) => result,
        })
      )
    const records = yield* Effect.forEach(addCollectionMovie)(movies)

    yield* api.setCollectionMonitoring(collection.id)

    const added = records.filter((record) => record.action === 'added').length
    const skipped = records.filter((record) => record.action === 'skipped').length
    const failed = records.filter((record) => record.action === 'failed').length
    const visibleRecords = take(records, options.resultLimit)

    return {
      collectionTmdbId,
      title: collection.title,
      totalMovies: movies.length,
      added,
      skipped,
      failed,
      searchForMovies: options.searchForMovies,
      monitored: true,
      searchOnAdd: true,
      records: visibleRecords,
      recordsTruncated: visibleRecords.length < records.length,
    }
  })

export const removeMovie = (
  tmdbId: number,
  options: RemoveMovieOptions
): Effect.Effect<RemoveMovieResult, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const movie = yield* api.getMovieByTmdbId(tmdbId)
    const selected = yield* Option.match(movie, {
      onNone: () => Effect.fail(notFound(`Movie with TMDB ID ${tmdbId} is not in the Radarr library`)),
      onSome: (record) => Effect.succeed(record),
    })

    yield* api.removeMovie(selected.id, { deleteFiles: options.deleteFiles })

    return { removed: true, tmdbId, deleteFiles: options.deleteFiles }
  })

export const queue = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<QueueRecord>, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const result = yield* api.queue(options.limit)
    const records = take(result.records, options.limit)
    return { count: records.length, totalRecords: result.totalRecords, records }
  })

export const calendar = (
  options: CalendarOptions = defaultCalendarOptions
): Effect.Effect<CalendarResult, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const records = yield* api.calendar(options.days)
    return { days: options.days, count: records.length, records }
  })

export const missing = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<MovieReleaseRecord>, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const result = yield* api.missing(options.limit)
    const records = take(result.records, options.limit)
    return { count: records.length, totalRecords: result.totalRecords, records }
  })

export const history = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<HistoryRecord>, RadarrError, RadarrApi | RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    yield* radarrConfig.get
    const api = yield* RadarrApi
    const result = yield* api.history(options.limit)
    const records = take(result.records, options.limit)
    return { count: records.length, totalRecords: result.totalRecords, records }
  })

export const firstTmdbId = (results: ReadonlyArray<MovieLookupResult>): Option.Option<number> =>
  first(results).pipe(Option.map((result) => result.tmdbId))
