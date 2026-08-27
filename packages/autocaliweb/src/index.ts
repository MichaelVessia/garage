export { unreachable } from './errors.js'
export type { AutocaliwebError } from './errors.js'
export { AutocaliwebApiLive } from './http.js'
export {
  BookInfoRecord,
  BookRecord,
  CatalogEntry,
  ListResult,
  SearchResult,
  StatsResult,
  StatusResult,
} from './model.js'
export type { LimitOptions, SearchOptions } from './model.js'
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
