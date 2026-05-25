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
  SeriesRecord,
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

const markDefaultQualityProfile = (
  profile: ConfigSummary['qualityProfiles'][number],
  defaultQualityProfileId: number
) => ({
  ...profile,
  isDefault: profile.id === defaultQualityProfileId,
})

const withQualityProfileName = (
  series: SeriesRecord,
  qualityProfiles: ConfigSummary['qualityProfiles']
): SeriesRecord => {
  const { qualityProfileId } = series
  if (qualityProfileId === undefined) {
    return series
  }

  const qualityProfile = qualityProfiles.find((profile) => profile.id === qualityProfileId)
  return qualityProfile === undefined ? series : { ...series, qualityProfileName: qualityProfile.name }
}

export const status: Effect.Effect<SystemStatus, SonarrError, SonarrApi | SonarrConfig> = Effect.gen(function* () {
  const config = yield* SonarrConfig
  yield* config.get()
  const api = yield* SonarrApi
  return yield* api.status()
}).pipe(Effect.withSpan('sonarr.status'), Effect.annotateLogs({ package: '@garage/sonarr', operation: 'status' }))

export const config: Effect.Effect<ConfigSummary, SonarrError, SonarrApi | SonarrConfig> = Effect.gen(function* () {
  const sonarrConfig = yield* SonarrConfig
  const values = yield* sonarrConfig.get()
  const api = yield* SonarrApi
  const rootFolders = yield* api.rootFolders()
  const qualityProfiles = (yield* api.qualityProfiles()).map((profile) =>
    markDefaultQualityProfile(profile, values.defaultQualityProfileId)
  )

  return { rootFolders, qualityProfiles }
}).pipe(Effect.withSpan('sonarr.config'), Effect.annotateLogs({ package: '@garage/sonarr', operation: 'config' }))

export const search = Effect.fn('sonarr.search')(
  function* (
    query: string,
    options?: LimitOptions
  ): Effect.fn.Return<SearchResult, SonarrError, SonarrApi | SonarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'sonarr.query_length': query.length, 'sonarr.limit': limitOptions.limit })
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const results = take(yield* api.lookupSeries(query), limitOptions.limit)

    return { query, count: results.length, results }
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'search' })
)

export const exists = Effect.fn('sonarr.exists')(
  function* (tvdbId: number): Effect.fn.Return<ExistsResult, SonarrError, SonarrApi | SonarrConfig> {
    yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': tvdbId })
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const series = yield* api.getSeriesByTvdbId(tvdbId)

    return yield* Option.match(series, {
      onNone: () => Effect.succeed({ tvdbId, exists: false }),
      onSome: (record) =>
        api.qualityProfiles().pipe(
          Effect.map((qualityProfiles) => ({
            tvdbId,
            exists: true,
            series: withQualityProfileName(record, qualityProfiles),
          }))
        ),
    })
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'exists' })
)

export const addSeries = Effect.fn('sonarr.addSeries')(
  function* (
    tvdbId: number,
    options: AddSeriesOptions
  ): Effect.fn.Return<AddSeriesResult, SonarrError, SonarrApi | SonarrConfig> {
    yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': tvdbId })
    const sonarrConfig = yield* SonarrConfig
    const values = yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const lookup = yield* api.lookupSeriesByTvdbId(tvdbId)
    const selected = yield* Option.match(lookup, {
      onNone: () => Effect.fail(notFound(`No Sonarr lookup result found for TVDB ID ${tvdbId}`)),
      onSome: (record) => Effect.succeed(record),
    }).pipe(Effect.withSpan('sonarr.selectLookupResult'))
    const rootFolder = yield* first(yield* api.rootFolders()).pipe(
      Option.match({
        onNone: () => Effect.fail(notFound('No Sonarr root folders are configured')),
        onSome: (folder) => Effect.succeed(folder),
      }),
      Effect.withSpan('sonarr.selectRootFolder')
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
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'addSeries' })
)

export const removeSeries = Effect.fn('sonarr.removeSeries')(
  function* (
    tvdbId: number,
    options: RemoveSeriesOptions
  ): Effect.fn.Return<RemoveSeriesResult, SonarrError, SonarrApi | SonarrConfig> {
    yield* Effect.annotateCurrentSpan({ 'sonarr.tvdb_id': tvdbId, 'sonarr.delete_files': options.deleteFiles })
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const series = yield* api.getSeriesByTvdbId(tvdbId)
    const selected = yield* Option.match(series, {
      onNone: () => Effect.fail(notFound(`Series with TVDB ID ${tvdbId} is not in the Sonarr library`)),
      onSome: (record) => Effect.succeed(record),
    }).pipe(Effect.withSpan('sonarr.selectSeries'))

    yield* api.removeSeries(selected.id, { deleteFiles: options.deleteFiles })

    return { removed: true, tvdbId, deleteFiles: options.deleteFiles }
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'removeSeries' })
)

export const queue: (
  options?: LimitOptions
) => Effect.Effect<ListResult<QueueRecord>, SonarrError, SonarrApi | SonarrConfig> = Effect.fn('sonarr.queue')(
  function* (options?: LimitOptions): Effect.fn.Return<ListResult<QueueRecord>, SonarrError, SonarrApi | SonarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'sonarr.limit': limitOptions.limit })
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const result = yield* api.queue(limitOptions.limit)
    const records = take(result.records, limitOptions.limit)
    return { count: records.length, totalRecords: result.totalRecords, records }
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'queue' })
)

export const calendar: (
  options?: CalendarOptions
) => Effect.Effect<CalendarResult, SonarrError, SonarrApi | SonarrConfig> = Effect.fn('sonarr.calendar')(
  function* (options?: CalendarOptions): Effect.fn.Return<CalendarResult, SonarrError, SonarrApi | SonarrConfig> {
    const calendarOptions = options ?? defaultCalendarOptions
    yield* Effect.annotateCurrentSpan({ 'sonarr.days': calendarOptions.days })
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const records = yield* api.calendar(calendarOptions.days)
    return { days: calendarOptions.days, count: records.length, records }
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'calendar' })
)

export const missing: (
  options?: LimitOptions
) => Effect.Effect<ListResult<EpisodeRecord>, SonarrError, SonarrApi | SonarrConfig> = Effect.fn('sonarr.missing')(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<EpisodeRecord>, SonarrError, SonarrApi | SonarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'sonarr.limit': limitOptions.limit })
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const result = yield* api.missing(limitOptions.limit)
    const records = take(result.records, limitOptions.limit)
    return { count: records.length, totalRecords: result.totalRecords, records }
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'missing' })
)

export const history: (
  options?: LimitOptions
) => Effect.Effect<ListResult<HistoryRecord>, SonarrError, SonarrApi | SonarrConfig> = Effect.fn('sonarr.history')(
  function* (
    options?: LimitOptions
  ): Effect.fn.Return<ListResult<HistoryRecord>, SonarrError, SonarrApi | SonarrConfig> {
    const limitOptions = options ?? defaultLimitOptions
    yield* Effect.annotateCurrentSpan({ 'sonarr.limit': limitOptions.limit })
    const sonarrConfig = yield* SonarrConfig
    yield* sonarrConfig.get()
    const api = yield* SonarrApi
    const result = yield* api.history(limitOptions.limit)
    const records = take(result.records, limitOptions.limit)
    return { count: records.length, totalRecords: result.totalRecords, records }
  },
  Effect.annotateLogs({ package: '@garage/sonarr', operation: 'history' })
)

export const firstTvdbId = (results: ReadonlyArray<SeriesLookupResult>): Option.Option<number> =>
  first(results).pipe(Option.map((result) => result.tvdbId))
