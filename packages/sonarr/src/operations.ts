import { Effect, Option } from 'effect'

import { notFound } from './errors.js'
import type { SonarrError } from './errors.js'
import type {
  AddSeriesOptions,
  AddSeriesResult,
  CalendarOptions,
  CalendarResult,
  ConfigSummary,
  EpisodeRecord,
  ExistsResult,
  HistoryRecord,
  LimitOptions,
  ListResult,
  QueueRecord,
  RemoveSeriesOptions,
  RemoveSeriesResult,
  SearchResult,
  SeriesLookupResult,
  SystemStatus,
} from './model.js'
import { SonarrApi, SonarrConfig } from './services.js'

export const defaultLimit = 10
export const defaultCalendarDays = 14

const defaultLimitOptions: LimitOptions = { limit: defaultLimit }
const defaultCalendarOptions: CalendarOptions = { days: defaultCalendarDays }

const take = <A>(items: ReadonlyArray<A>, limit: number): ReadonlyArray<A> => items.slice(0, limit)

const first = <A>(items: ReadonlyArray<A>): Option.Option<A> => {
  const [head] = items
  return head === undefined ? Option.none() : Option.some(head)
}

export const status: Effect.Effect<SystemStatus, SonarrError, SonarrApi | SonarrConfig> = Effect.gen(function* () {
  const config = yield* SonarrConfig
  yield* config.get
  const api = yield* SonarrApi
  return yield* api.status
})

export const config: Effect.Effect<ConfigSummary, SonarrError, SonarrApi | SonarrConfig> = Effect.gen(function* () {
  const sonarrConfig = yield* SonarrConfig
  yield* sonarrConfig.get
  const api = yield* SonarrApi
  const rootFolders = yield* api.rootFolders
  const qualityProfiles = yield* api.qualityProfiles

  return { rootFolders, qualityProfiles }
})

export const search = (
  query: string,
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<SearchResult, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get
    const api = yield* SonarrApi
    const results = take(yield* api.lookupSeries(query), options.limit)

    return { query, count: results.length, results }
  })

export const exists = (tvdbId: number): Effect.Effect<ExistsResult, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get
    const api = yield* SonarrApi
    const series = yield* api.getSeriesByTvdbId(tvdbId)

    return Option.match(series, {
      onNone: () => ({ tvdbId, exists: false }),
      onSome: (record) => ({ tvdbId, exists: true, series: record }),
    })
  })

export const addSeries = (
  tvdbId: number,
  options: AddSeriesOptions
): Effect.Effect<AddSeriesResult, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    const values = yield* sonarrConfig.get
    const api = yield* SonarrApi
    const lookup = yield* api.lookupSeriesByTvdbId(tvdbId)
    const selected = yield* Option.match(lookup, {
      onNone: () => Effect.fail(notFound(`No Sonarr lookup result found for TVDB ID ${tvdbId}`)),
      onSome: (record) => Effect.succeed(record),
    })
    const rootFolder = yield* first(yield* api.rootFolders).pipe(
      Option.match({
        onNone: () => Effect.fail(notFound('No Sonarr root folders are configured')),
        onSome: (folder) => Effect.succeed(folder),
      })
    )
    const qualityProfileId = options.qualityProfileId ?? values.defaultQualityProfileId
    const series = yield* api.addSeries(selected, {
      qualityProfileId,
      rootFolderPath: rootFolder.path,
      searchForMissingEpisodes: options.searchForMissingEpisodes,
    })

    return {
      added: true,
      series,
      qualityProfileId,
      rootFolderPath: rootFolder.path,
      searchForMissingEpisodes: options.searchForMissingEpisodes,
    }
  })

export const removeSeries = (
  tvdbId: number,
  options: RemoveSeriesOptions
): Effect.Effect<RemoveSeriesResult, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get
    const api = yield* SonarrApi
    const series = yield* api.getSeriesByTvdbId(tvdbId)
    const selected = yield* Option.match(series, {
      onNone: () => Effect.fail(notFound(`Series with TVDB ID ${tvdbId} is not in the Sonarr library`)),
      onSome: (record) => Effect.succeed(record),
    })

    yield* api.removeSeries(selected.id, { deleteFiles: options.deleteFiles })

    return { removed: true, tvdbId, deleteFiles: options.deleteFiles }
  })

export const queue = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<QueueRecord>, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get
    const api = yield* SonarrApi
    const records = take(yield* api.queue, options.limit)
    return { count: records.length, records }
  })

export const calendar = (
  options: CalendarOptions = defaultCalendarOptions
): Effect.Effect<CalendarResult, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get
    const api = yield* SonarrApi
    const records = yield* api.calendar(options.days)
    return { days: options.days, count: records.length, records }
  })

export const missing = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<EpisodeRecord>, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get
    const api = yield* SonarrApi
    const records = take(yield* api.missing, options.limit)
    return { count: records.length, records }
  })

export const history = (
  options: LimitOptions = defaultLimitOptions
): Effect.Effect<ListResult<HistoryRecord>, SonarrError, SonarrApi | SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get
    const api = yield* SonarrApi
    const records = take(yield* api.history(options.limit), options.limit)
    return { count: records.length, records }
  })

export const firstTvdbId = (results: ReadonlyArray<SeriesLookupResult>): Option.Option<number> =>
  first(results).pipe(Option.map((result) => result.tvdbId))
