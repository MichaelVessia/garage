import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  ItemRecord as DomainItemRecord,
  LibraryRecord as DomainLibraryRecord,
  LibraryStats as DomainLibraryStats,
  ListResultSchema as DomainListResultSchema,
  ScheduledTaskRecord as DomainScheduledTaskRecord,
  SessionRecord as DomainSessionRecord,
  SystemStatus as DomainSystemStatus,
  UserRecord as DomainUserRecord,
} from './model.js'
import type {
  ItemRecord,
  LibraryRecord,
  ListResult,
  ScheduledTaskRecord,
  SessionRecord,
  SystemStatus,
  UserRecord,
} from './model.js'

const NullableString = Schema.NullOr(Schema.String).pipe(Schema.optional)
const NullableNumber = Schema.NullOr(Schema.Number).pipe(Schema.optional)
const NullableBoolean = Schema.NullOr(Schema.Boolean).pipe(Schema.optional)
const NullableStringArray = Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional)

const SystemInfoApi = Schema.Struct({
  ServerName: NullableString,
  Version: NullableString,
  Id: NullableString,
  OperatingSystem: NullableString,
  ProductName: NullableString,
  LocalAddress: NullableString,
})

const Policy = Schema.Struct({
  IsAdministrator: NullableBoolean,
  IsDisabled: NullableBoolean,
})

const UserApi = Schema.Struct({
  Id: Schema.String,
  Name: NullableString,
  LastActivityDate: NullableString,
  Policy: Schema.NullOr(Policy).pipe(Schema.optional),
})

const LibraryApi = Schema.Struct({
  Name: NullableString,
  CollectionType: NullableString,
  ItemId: NullableString,
  Locations: NullableStringArray,
})

const BaseItemApi = Schema.Struct({
  Id: Schema.String,
  Name: Schema.String,
  Type: NullableString,
  SeriesName: NullableString,
  ParentIndexNumber: NullableNumber,
  IndexNumber: NullableNumber,
  DateCreated: NullableString,
  ProductionYear: NullableNumber,
  RunTimeTicks: NullableNumber,
})

const PlayState = Schema.Struct({
  PlayMethod: NullableString,
  PositionTicks: NullableNumber,
  IsPaused: NullableBoolean,
})

const SessionApi = Schema.Struct({
  Id: NullableString,
  UserName: NullableString,
  Client: NullableString,
  DeviceName: NullableString,
  ApplicationVersion: NullableString,
  LastActivityDate: NullableString,
  NowPlayingItem: Schema.NullOr(BaseItemApi).pipe(Schema.optional),
  PlayState: Schema.NullOr(PlayState).pipe(Schema.optional),
})

const ItemsResponseApi = Schema.Struct({
  Items: Schema.Array(BaseItemApi),
})

export const LibraryStatsSchema = DomainLibraryStats

const TaskResult = Schema.Struct({
  Status: NullableString,
  EndTimeUtc: NullableString,
})

const ScheduledTaskApi = Schema.Struct({
  Id: Schema.String,
  Name: NullableString,
  State: NullableString,
  LastExecutionResult: Schema.NullOr(TaskResult).pipe(Schema.optional),
  Category: NullableString,
})

// oxlint-disable-next-line effect/prefer-option-over-null -- wire-boundary helper: external Jellyfin API sends null; domain records use `| undefined` optional fields.
const fromNullable = <A>(value: A | null | undefined): A | undefined =>
  Option.getOrUndefined(Option.fromNullishOr(value))

const systemStatusFromApi = (info: typeof SystemInfoApi.Type): SystemStatus => ({
  serverName: fromNullable(info.ServerName),
  version: fromNullable(info.Version),
  id: fromNullable(info.Id),
  operatingSystem: fromNullable(info.OperatingSystem),
  productName: fromNullable(info.ProductName),
  localAddress: fromNullable(info.LocalAddress),
})

const systemStatusToApi = (status: SystemStatus): typeof SystemInfoApi.Type => ({
  ServerName: status.serverName,
  Version: status.version,
  Id: status.id,
  OperatingSystem: status.operatingSystem,
  ProductName: status.productName,
  LocalAddress: status.localAddress,
})

export const SystemInfoSchema = SystemInfoApi.pipe(
  Schema.decodeTo(DomainSystemStatus, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const userRecordFromApi = (user: typeof UserApi.Type): UserRecord => ({
  id: user.Id,
  name: fromNullable(user.Name),
  lastActivityDate: fromNullable(user.LastActivityDate),
  isAdministrator: fromNullable(user.Policy?.IsAdministrator),
  isDisabled: fromNullable(user.Policy?.IsDisabled),
})

const userRecordToApi = (user: UserRecord): typeof UserApi.Type => ({
  Id: user.id,
  Name: user.name,
  LastActivityDate: user.lastActivityDate,
  Policy: { IsAdministrator: user.isAdministrator, IsDisabled: user.isDisabled },
})

export const UserSchema = UserApi.pipe(
  Schema.decodeTo(DomainUserRecord, {
    decode: SchemaGetter.transform(userRecordFromApi),
    encode: SchemaGetter.transform(userRecordToApi),
  })
)

const libraryRecordFromApi = (library: typeof LibraryApi.Type): LibraryRecord => ({
  name: fromNullable(library.Name),
  collectionType: fromNullable(library.CollectionType),
  itemId: fromNullable(library.ItemId),
  locations: fromNullable(library.Locations),
})

const libraryRecordToApi = (library: LibraryRecord): typeof LibraryApi.Type => ({
  Name: library.name,
  CollectionType: library.collectionType,
  ItemId: library.itemId,
  Locations: library.locations,
})

export const LibrarySchema = LibraryApi.pipe(
  Schema.decodeTo(DomainLibraryRecord, {
    decode: SchemaGetter.transform(libraryRecordFromApi),
    encode: SchemaGetter.transform(libraryRecordToApi),
  })
)

const sessionRecordFromApi = (session: typeof SessionApi.Type): SessionRecord => ({
  sessionId: fromNullable(session.Id),
  user: fromNullable(session.UserName),
  client: fromNullable(session.Client),
  device: fromNullable(session.DeviceName),
  appVersion: fromNullable(session.ApplicationVersion),
  lastActivityDate: fromNullable(session.LastActivityDate),
  nowPlaying: fromNullable(session.NowPlayingItem?.Name),
  playMethod: fromNullable(session.PlayState?.PlayMethod),
})

const sessionRecordToApi = (session: SessionRecord): typeof SessionApi.Type => ({
  Id: session.sessionId,
  UserName: session.user,
  Client: session.client,
  DeviceName: session.device,
  ApplicationVersion: session.appVersion,
  LastActivityDate: session.lastActivityDate,
  NowPlayingItem: session.nowPlaying === undefined ? undefined : { Id: '', Name: session.nowPlaying },
  PlayState: { PlayMethod: session.playMethod },
})

export const SessionSchema = SessionApi.pipe(
  Schema.decodeTo(DomainSessionRecord, {
    decode: SchemaGetter.transform(sessionRecordFromApi),
    encode: SchemaGetter.transform(sessionRecordToApi),
  })
)

const itemRecordFromApi = (item: typeof BaseItemApi.Type): ItemRecord => ({
  id: item.Id,
  name: item.Name,
  type: fromNullable(item.Type),
  series: fromNullable(item.SeriesName),
  season: fromNullable(item.ParentIndexNumber),
  episode: fromNullable(item.IndexNumber),
  dateCreated: fromNullable(item.DateCreated),
  productionYear: fromNullable(item.ProductionYear),
})

const itemRecordToApi = (item: ItemRecord): typeof BaseItemApi.Type => ({
  Id: item.id,
  Name: item.name,
  Type: item.type,
  SeriesName: item.series,
  ParentIndexNumber: item.season,
  IndexNumber: item.episode,
  DateCreated: item.dateCreated,
  ProductionYear: item.productionYear,
})

export const BaseItemSchema = BaseItemApi.pipe(
  Schema.decodeTo(DomainItemRecord, {
    decode: SchemaGetter.transform(itemRecordFromApi),
    encode: SchemaGetter.transform(itemRecordToApi),
  })
)

const scheduledTaskRecordFromApi = (task: typeof ScheduledTaskApi.Type): ScheduledTaskRecord => ({
  id: task.Id,
  name: fromNullable(task.Name),
  state: fromNullable(task.State),
  lastExecutionResult: fromNullable(task.LastExecutionResult?.Status),
  lastEndTime: fromNullable(task.LastExecutionResult?.EndTimeUtc),
  category: fromNullable(task.Category),
})

const scheduledTaskRecordToApi = (task: ScheduledTaskRecord): typeof ScheduledTaskApi.Type => ({
  Id: task.id,
  Name: task.name,
  State: task.state,
  LastExecutionResult: { Status: task.lastExecutionResult, EndTimeUtc: task.lastEndTime },
  Category: task.category,
})

export const ScheduledTaskSchema = ScheduledTaskApi.pipe(
  Schema.decodeTo(DomainScheduledTaskRecord, {
    decode: SchemaGetter.transform(scheduledTaskRecordFromApi),
    encode: SchemaGetter.transform(scheduledTaskRecordToApi),
  })
)

const itemsResponseFromApi = (response: typeof ItemsResponseApi.Type): ListResult<ItemRecord> => {
  const records = response.Items.map(itemRecordFromApi)
  return { count: records.length, records }
}

const itemsResponseToApi = (result: ListResult<ItemRecord>): typeof ItemsResponseApi.Type => ({
  Items: result.records.map(itemRecordToApi),
})

export const ItemsResponseSchema = ItemsResponseApi.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainItemRecord), {
    decode: SchemaGetter.transform(itemsResponseFromApi),
    encode: SchemaGetter.transform(itemsResponseToApi),
  })
)
