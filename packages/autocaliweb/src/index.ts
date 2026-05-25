export {
  AutocaliwebDecodeError,
  AutocaliwebEnvMissingError,
  AutocaliwebError,
  AutocaliwebHttpError,
  AutocaliwebUnreachableError,
  decodeError,
  envFix,
  envMissing,
  httpError,
  unreachable,
} from './errors.js'
export type { AutocaliwebErrorCode } from './errors.js'
export { AutocaliwebApiLive } from './http.js'
export {
  bookInfo,
  books,
  catalog,
  defaultLimit,
  recent,
  search,
  shelves,
  stats,
  status,
  version,
} from './operations.js'
export { AutocaliwebApi, AutocaliwebConfig, AutocaliwebConfigLive } from './services.js'
export type {
  AutocaliwebConfigValue,
  BookInfoOptions,
  BookInfoRecord,
  BookRecord,
  CatalogEntry,
  DownloadLink,
  LimitOptions,
  ListResult,
  SearchOptions,
  SearchResult,
  StatsResult,
  StatusResult,
} from './model.js'
