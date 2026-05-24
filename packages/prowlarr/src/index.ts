export {
  cliUsageError,
  decodeError,
  envFix,
  envMissing,
  httpError,
  syncConfirmationRequired,
  unreachable,
} from './errors.js'
export type { ProwlarrErrorCode } from './errors.js'
export { ProwlarrError } from './errors.js'
export { ProwlarrApiLive } from './http.js'
export type {
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
  ProwlarrConfigValue,
  ReleaseRecord,
  SearchOptions,
  SearchProtocol,
  SearchResult,
  SystemStatus,
  TvSearchOptions,
} from './model.js'
export {
  applications,
  defaultHistoryLimit,
  defaultLimit,
  health,
  history,
  indexerStats,
  indexers,
  movieSearch,
  search,
  status,
  sync,
  testIndexer,
  tvSearch,
} from './operations.js'
export { ProwlarrApi, ProwlarrConfig, ProwlarrConfigLive } from './services.js'
