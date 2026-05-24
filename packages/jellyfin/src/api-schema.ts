import { Schema } from 'effect'

import type {
  ItemRecord,
  LibraryRecord,
  LibraryStats,
  ListResult,
  NowPlayingRecord,
  ScheduledTaskRecord,
  SessionRecord,
  SystemStatus,
  UserRecord,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))

export const SystemInfoSchema = Schema.Struct({
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

export const UserSchema = Schema.Struct({
  Id: Schema.String,
  Name: NullableString,
  LastActivityDate: NullableString,
  Policy: Schema.optional(Schema.NullOr(PolicySchema)),
})

export const LibrarySchema = Schema.Struct({
  Name: NullableString,
  CollectionType: NullableString,
  ItemId: NullableString,
  Locations: NullableStringArray,
})

export const BaseItemSchema = Schema.Struct({
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

export const SessionSchema = Schema.Struct({
  Id: NullableString,
  UserName: NullableString,
  Client: NullableString,
  DeviceName: NullableString,
  ApplicationVersion: NullableString,
  LastActivityDate: NullableString,
  NowPlayingItem: Schema.optional(Schema.NullOr(BaseItemSchema)),
  PlayState: Schema.optional(Schema.NullOr(PlayStateSchema)),
})

export const ItemsResponseSchema = Schema.Struct({
  Items: Schema.Array(BaseItemSchema),
})

export const LibraryStatsSchema = Schema.Record(Schema.String, Schema.Number)

const TaskResultSchema = Schema.Struct({
  Status: NullableString,
  EndTimeUtc: NullableString,
})

export const ScheduledTaskSchema = Schema.Struct({
  Id: Schema.String,
  Name: NullableString,
  State: NullableString,
  LastExecutionResult: Schema.optional(Schema.NullOr(TaskResultSchema)),
  Category: NullableString,
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

export const toSystemStatus = (info: typeof SystemInfoSchema.Type): SystemStatus => ({
  serverName: fromNullable(info.ServerName),
  version: fromNullable(info.Version),
  id: fromNullable(info.Id),
  operatingSystem: fromNullable(info.OperatingSystem),
  productName: fromNullable(info.ProductName),
  localAddress: fromNullable(info.LocalAddress),
})

export const toUserRecord = (user: typeof UserSchema.Type): UserRecord => ({
  id: user.Id,
  name: fromNullable(user.Name),
  lastActivityDate: fromNullable(user.LastActivityDate),
  isAdministrator: fromNullable(user.Policy?.IsAdministrator),
  isDisabled: fromNullable(user.Policy?.IsDisabled),
})

export const toLibraryRecord = (library: typeof LibrarySchema.Type): LibraryRecord => ({
  name: fromNullable(library.Name),
  collectionType: fromNullable(library.CollectionType),
  itemId: fromNullable(library.ItemId),
  locations: fromNullable(library.Locations),
})

export const toSessionRecord = (session: typeof SessionSchema.Type): SessionRecord => ({
  sessionId: fromNullable(session.Id),
  user: fromNullable(session.UserName),
  client: fromNullable(session.Client),
  device: fromNullable(session.DeviceName),
  appVersion: fromNullable(session.ApplicationVersion),
  lastActivityDate: fromNullable(session.LastActivityDate),
  nowPlaying: fromNullable(session.NowPlayingItem?.Name),
  playMethod: fromNullable(session.PlayState?.PlayMethod),
})

export const toNowPlayingRecord = (session: typeof SessionSchema.Type): NowPlayingRecord | undefined => {
  const item = session.NowPlayingItem
  if (item === null || item === undefined) {
    return undefined
  }

  return {
    user: fromNullable(session.UserName),
    device: fromNullable(session.DeviceName),
    client: fromNullable(session.Client),
    item: item.Name,
    type: fromNullable(item.Type),
    series: fromNullable(item.SeriesName),
    season: fromNullable(item.ParentIndexNumber),
    episode: fromNullable(item.IndexNumber),
    positionTicks: fromNullable(session.PlayState?.PositionTicks),
    runtimeTicks: fromNullable(item.RunTimeTicks),
    isPaused: fromNullable(session.PlayState?.IsPaused),
    playMethod: fromNullable(session.PlayState?.PlayMethod),
  }
}

export const toItemRecord = (item: typeof BaseItemSchema.Type): ItemRecord => ({
  id: item.Id,
  name: item.Name,
  type: fromNullable(item.Type),
  series: fromNullable(item.SeriesName),
  season: fromNullable(item.ParentIndexNumber),
  episode: fromNullable(item.IndexNumber),
  dateCreated: fromNullable(item.DateCreated),
  productionYear: fromNullable(item.ProductionYear),
})

export const toScheduledTaskRecord = (task: typeof ScheduledTaskSchema.Type): ScheduledTaskRecord => ({
  id: task.Id,
  name: fromNullable(task.Name),
  state: fromNullable(task.State),
  lastExecutionResult: fromNullable(task.LastExecutionResult?.Status),
  lastEndTime: fromNullable(task.LastExecutionResult?.EndTimeUtc),
  category: fromNullable(task.Category),
})

export const toListResult = <Record>(records: ReadonlyArray<Record>): ListResult<Record> => ({
  count: records.length,
  records,
})

export const toLibraryStats = (stats: typeof LibraryStatsSchema.Type): LibraryStats => stats
