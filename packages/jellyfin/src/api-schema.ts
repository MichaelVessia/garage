import { Schema, SchemaGetter } from 'effect'

import {
  ItemRecordSchema as DomainItemRecordSchema,
  LibraryRecordSchema as DomainLibraryRecordSchema,
  LibraryStatsSchema as DomainLibraryStatsSchema,
  ListResultSchema as DomainListResultSchema,
  ScheduledTaskRecordSchema as DomainScheduledTaskRecordSchema,
  SessionRecordSchema as DomainSessionRecordSchema,
  SystemStatusSchema as DomainSystemStatusSchema,
  UserRecordSchema as DomainUserRecordSchema,
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

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))

const SystemInfoApiSchema = Schema.Struct({
  ServerName: NullableString,
  Version: NullableString,
  Id: NullableString,
  OperatingSystem: NullableString,
  ProductName: NullableString,
  LocalAddress: NullableString,
})

const PolicySchema = Schema.Struct({
  IsAdministrator: NullableBoolean,
  IsDisabled: NullableBoolean,
})

const UserApiSchema = Schema.Struct({
  Id: Schema.String,
  Name: NullableString,
  LastActivityDate: NullableString,
  Policy: Schema.optional(Schema.NullOr(PolicySchema)),
})

const LibraryApiSchema = Schema.Struct({
  Name: NullableString,
  CollectionType: NullableString,
  ItemId: NullableString,
  Locations: NullableStringArray,
})

const BaseItemApiSchema = Schema.Struct({
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

const PlayStateSchema = Schema.Struct({
  PlayMethod: NullableString,
  PositionTicks: NullableNumber,
  IsPaused: NullableBoolean,
})

const SessionApiSchema = Schema.Struct({
  Id: NullableString,
  UserName: NullableString,
  Client: NullableString,
  DeviceName: NullableString,
  ApplicationVersion: NullableString,
  LastActivityDate: NullableString,
  NowPlayingItem: Schema.optional(Schema.NullOr(BaseItemApiSchema)),
  PlayState: Schema.optional(Schema.NullOr(PlayStateSchema)),
})

const ItemsResponseApiSchema = Schema.Struct({
  Items: Schema.Array(BaseItemApiSchema),
})

export const LibraryStatsSchema = DomainLibraryStatsSchema

const TaskResultSchema = Schema.Struct({
  Status: NullableString,
  EndTimeUtc: NullableString,
})

const ScheduledTaskApiSchema = Schema.Struct({
  Id: Schema.String,
  Name: NullableString,
  State: NullableString,
  LastExecutionResult: Schema.optional(Schema.NullOr(TaskResultSchema)),
  Category: NullableString,
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const systemStatusFromApi = (info: typeof SystemInfoApiSchema.Type): SystemStatus => ({
  serverName: fromNullable(info.ServerName),
  version: fromNullable(info.Version),
  id: fromNullable(info.Id),
  operatingSystem: fromNullable(info.OperatingSystem),
  productName: fromNullable(info.ProductName),
  localAddress: fromNullable(info.LocalAddress),
})

const systemStatusToApi = (status: SystemStatus): typeof SystemInfoApiSchema.Type => ({
  ServerName: status.serverName,
  Version: status.version,
  Id: status.id,
  OperatingSystem: status.operatingSystem,
  ProductName: status.productName,
  LocalAddress: status.localAddress,
})

export const SystemInfoSchema = SystemInfoApiSchema.pipe(
  Schema.decodeTo(DomainSystemStatusSchema, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const userRecordFromApi = (user: typeof UserApiSchema.Type): UserRecord => ({
  id: user.Id,
  name: fromNullable(user.Name),
  lastActivityDate: fromNullable(user.LastActivityDate),
  isAdministrator: fromNullable(user.Policy?.IsAdministrator),
  isDisabled: fromNullable(user.Policy?.IsDisabled),
})

const userRecordToApi = (user: UserRecord): typeof UserApiSchema.Type => ({
  Id: user.id,
  Name: user.name,
  LastActivityDate: user.lastActivityDate,
  Policy: { IsAdministrator: user.isAdministrator, IsDisabled: user.isDisabled },
})

export const UserSchema = UserApiSchema.pipe(
  Schema.decodeTo(DomainUserRecordSchema, {
    decode: SchemaGetter.transform(userRecordFromApi),
    encode: SchemaGetter.transform(userRecordToApi),
  })
)

const libraryRecordFromApi = (library: typeof LibraryApiSchema.Type): LibraryRecord => ({
  name: fromNullable(library.Name),
  collectionType: fromNullable(library.CollectionType),
  itemId: fromNullable(library.ItemId),
  locations: fromNullable(library.Locations),
})

const libraryRecordToApi = (library: LibraryRecord): typeof LibraryApiSchema.Type => ({
  Name: library.name,
  CollectionType: library.collectionType,
  ItemId: library.itemId,
  Locations: library.locations,
})

export const LibrarySchema = LibraryApiSchema.pipe(
  Schema.decodeTo(DomainLibraryRecordSchema, {
    decode: SchemaGetter.transform(libraryRecordFromApi),
    encode: SchemaGetter.transform(libraryRecordToApi),
  })
)

const sessionRecordFromApi = (session: typeof SessionApiSchema.Type): SessionRecord => ({
  sessionId: fromNullable(session.Id),
  user: fromNullable(session.UserName),
  client: fromNullable(session.Client),
  device: fromNullable(session.DeviceName),
  appVersion: fromNullable(session.ApplicationVersion),
  lastActivityDate: fromNullable(session.LastActivityDate),
  nowPlaying: fromNullable(session.NowPlayingItem?.Name),
  playMethod: fromNullable(session.PlayState?.PlayMethod),
})

const sessionRecordToApi = (session: SessionRecord): typeof SessionApiSchema.Type => ({
  Id: session.sessionId,
  UserName: session.user,
  Client: session.client,
  DeviceName: session.device,
  ApplicationVersion: session.appVersion,
  LastActivityDate: session.lastActivityDate,
  NowPlayingItem: session.nowPlaying === undefined ? undefined : { Id: '', Name: session.nowPlaying },
  PlayState: { PlayMethod: session.playMethod },
})

export const SessionSchema = SessionApiSchema.pipe(
  Schema.decodeTo(DomainSessionRecordSchema, {
    decode: SchemaGetter.transform(sessionRecordFromApi),
    encode: SchemaGetter.transform(sessionRecordToApi),
  })
)

const itemRecordFromApi = (item: typeof BaseItemApiSchema.Type): ItemRecord => ({
  id: item.Id,
  name: item.Name,
  type: fromNullable(item.Type),
  series: fromNullable(item.SeriesName),
  season: fromNullable(item.ParentIndexNumber),
  episode: fromNullable(item.IndexNumber),
  dateCreated: fromNullable(item.DateCreated),
  productionYear: fromNullable(item.ProductionYear),
})

const itemRecordToApi = (item: ItemRecord): typeof BaseItemApiSchema.Type => ({
  Id: item.id,
  Name: item.name,
  Type: item.type,
  SeriesName: item.series,
  ParentIndexNumber: item.season,
  IndexNumber: item.episode,
  DateCreated: item.dateCreated,
  ProductionYear: item.productionYear,
})

export const BaseItemSchema = BaseItemApiSchema.pipe(
  Schema.decodeTo(DomainItemRecordSchema, {
    decode: SchemaGetter.transform(itemRecordFromApi),
    encode: SchemaGetter.transform(itemRecordToApi),
  })
)

const scheduledTaskRecordFromApi = (task: typeof ScheduledTaskApiSchema.Type): ScheduledTaskRecord => ({
  id: task.Id,
  name: fromNullable(task.Name),
  state: fromNullable(task.State),
  lastExecutionResult: fromNullable(task.LastExecutionResult?.Status),
  lastEndTime: fromNullable(task.LastExecutionResult?.EndTimeUtc),
  category: fromNullable(task.Category),
})

const scheduledTaskRecordToApi = (task: ScheduledTaskRecord): typeof ScheduledTaskApiSchema.Type => ({
  Id: task.id,
  Name: task.name,
  State: task.state,
  LastExecutionResult: { Status: task.lastExecutionResult, EndTimeUtc: task.lastEndTime },
  Category: task.category,
})

export const ScheduledTaskSchema = ScheduledTaskApiSchema.pipe(
  Schema.decodeTo(DomainScheduledTaskRecordSchema, {
    decode: SchemaGetter.transform(scheduledTaskRecordFromApi),
    encode: SchemaGetter.transform(scheduledTaskRecordToApi),
  })
)

const itemsResponseFromApi = (response: typeof ItemsResponseApiSchema.Type): ListResult<ItemRecord> => {
  const records = response.Items.map(itemRecordFromApi)
  return { count: records.length, records }
}

const itemsResponseToApi = (result: ListResult<ItemRecord>): typeof ItemsResponseApiSchema.Type => ({
  Items: result.records.map(itemRecordToApi),
})

export const ItemsResponseSchema = ItemsResponseApiSchema.pipe(
  Schema.decodeTo(DomainListResultSchema(DomainItemRecordSchema), {
    decode: SchemaGetter.transform(itemsResponseFromApi),
    encode: SchemaGetter.transform(itemsResponseToApi),
  })
)
