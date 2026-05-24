export { confirmationRequired, decodeError, envFix, envMissing, httpError, unreachable } from './errors.js'
export type { AdguardErrorCode } from './errors.js'
export { AdguardError } from './errors.js'
export { AdguardApiLive } from './http.js'
export type {
  ActiveClient,
  AdguardConfigValue,
  AutoClient,
  ClientLookupOptions,
  ClientsResult,
  DhcpStatus,
  FilterRecord,
  FiltersResult,
  JsonObject,
  LimitOptions,
  ListResult,
  PersistentClient,
  ProtectionState,
  ProtectionToggleOptions,
  ProtectionToggleState,
  QueryLogEntry,
  SearchOptions,
  Stats,
  StatsInfo,
  SystemStatus,
  TopRecord,
  VersionResult,
} from './model.js'
export {
  clients,
  clientsActive,
  defaultLimit,
  dhcpStatus,
  dnsConfig,
  filters,
  protectionToggle,
  queryLog,
  queryLogSearch,
  rules,
  searchLimit,
  stats,
  statsInfo,
  status,
  version,
} from './operations.js'
export { AdguardApi, AdguardConfig, AdguardConfigLive } from './services.js'
