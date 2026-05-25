import { Schema, SchemaGetter } from 'effect'

import {
  HistoryResultSchema as DomainHistoryResultSchema,
  QueueResultSchema as DomainQueueResultSchema,
  ServerStatsSchema as DomainServerStatsSchema,
  SystemStatusSchema as DomainSystemStatusSchema,
  VersionResultSchema as DomainVersionResultSchema,
} from './model.js'
import type {
  HistoryResult,
  HistorySlot,
  QueueResult,
  QueueSlot,
  ServerStats,
  ServerUsage,
  SystemStatus,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))
const ActionStatusSchema = Schema.optional(Schema.NullOr(Schema.Union([Schema.Boolean, Schema.String])))

const StatusApiSchema = Schema.Struct({
  version: NullableString,
  uptime: NullableString,
  paused: NullableBoolean,
  paused_all: NullableBoolean,
  speedlimit: NullableString,
  speedlimit_abs: NullableString,
  diskspace1_norm: NullableString,
  diskspace2_norm: NullableString,
  have_warnings: NullableBoolean,
  warnings: NullableStringArray,
  new_release: NullableString,
})

const FullStatusResponseApiSchema = Schema.Struct({
  status: StatusApiSchema,
})

const VersionResponseApiSchema = Schema.Struct({
  version: Schema.String,
})

const QueueSlotApiSchema = Schema.Struct({
  nzo_id: Schema.String,
  filename: Schema.String,
  status: NullableString,
  priority: NullableString,
  cat: NullableString,
  mb: NullableString,
  mbleft: NullableString,
  percentage: NullableString,
  timeleft: NullableString,
})

const QueueSchema = Schema.Struct({
  status: NullableString,
  paused: NullableBoolean,
  speed: NullableString,
  speedlimit: NullableString,
  timeleft: NullableString,
  mb: NullableString,
  mbleft: NullableString,
  noofslots: NullableNumber,
  noofslots_total: NullableNumber,
  slots: Schema.Array(QueueSlotApiSchema),
})

const QueueResponseApiSchema = Schema.Struct({
  queue: QueueSchema,
})

const HistorySlotApiSchema = Schema.Struct({
  nzo_id: Schema.String,
  name: Schema.String,
  status: NullableString,
  category: NullableString,
  bytes: NullableNumber,
  fail_message: NullableString,
  storage: NullableString,
  completed: NullableNumber,
})

const HistorySchema = Schema.Struct({
  total_size: NullableString,
  month_size: NullableString,
  week_size: NullableString,
  day_size: NullableString,
  noofslots: NullableNumber,
  slots: Schema.Array(HistorySlotApiSchema),
})

const HistoryResponseApiSchema = Schema.Struct({
  history: HistorySchema,
})

const ActionResponseApiSchema = Schema.Struct({
  status: ActionStatusSchema,
})

const ServerUsageApiSchema = Schema.Struct({
  total: NullableNumber,
  month: NullableNumber,
  week: NullableNumber,
  day: NullableNumber,
})

const ServerStatsApiSchema = Schema.Struct({
  total: NullableNumber,
  month: NullableNumber,
  week: NullableNumber,
  day: NullableNumber,
  servers: Schema.Record(Schema.String, ServerUsageApiSchema),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const systemStatusFromApi = (status: typeof StatusApiSchema.Type): SystemStatus => ({
  version: fromNullable(status.version),
  uptime: fromNullable(status.uptime),
  paused: fromNullable(status.paused),
  pausedAll: fromNullable(status.paused_all),
  speedlimit: fromNullable(status.speedlimit),
  speedlimitAbs: fromNullable(status.speedlimit_abs),
  diskspace1Norm: fromNullable(status.diskspace1_norm),
  diskspace2Norm: fromNullable(status.diskspace2_norm),
  haveWarnings: fromNullable(status.have_warnings),
  warnings: fromNullable(status.warnings),
  newRelease: fromNullable(status.new_release),
})

const systemStatusToApi = (status: SystemStatus): typeof StatusApiSchema.Type => ({
  version: status.version,
  uptime: status.uptime,
  paused: status.paused,
  paused_all: status.pausedAll,
  speedlimit: status.speedlimit,
  speedlimit_abs: status.speedlimitAbs,
  diskspace1_norm: status.diskspace1Norm,
  diskspace2_norm: status.diskspace2Norm,
  have_warnings: status.haveWarnings,
  warnings: status.warnings,
  new_release: status.newRelease,
})

export const StatusSchema = StatusApiSchema.pipe(
  Schema.decodeTo(DomainSystemStatusSchema, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const fullStatusFromApi = (response: typeof FullStatusResponseApiSchema.Type): SystemStatus =>
  systemStatusFromApi(response.status)

const fullStatusToApi = (status: SystemStatus): typeof FullStatusResponseApiSchema.Type => ({
  status: systemStatusToApi(status),
})

export const FullStatusResponseSchema = FullStatusResponseApiSchema.pipe(
  Schema.decodeTo(DomainSystemStatusSchema, {
    decode: SchemaGetter.transform(fullStatusFromApi),
    encode: SchemaGetter.transform(fullStatusToApi),
  })
)

export const VersionResponseSchema = VersionResponseApiSchema.pipe(Schema.decodeTo(DomainVersionResultSchema))

const queueSlotFromApi = (slot: typeof QueueSlotApiSchema.Type): QueueSlot => ({
  nzoId: slot.nzo_id,
  filename: slot.filename,
  status: fromNullable(slot.status),
  priority: fromNullable(slot.priority),
  category: fromNullable(slot.cat),
  mb: fromNullable(slot.mb),
  mbleft: fromNullable(slot.mbleft),
  percentage: fromNullable(slot.percentage),
  timeleft: fromNullable(slot.timeleft),
})

const queueSlotToApi = (slot: QueueSlot): typeof QueueSlotApiSchema.Type => ({
  nzo_id: slot.nzoId,
  filename: slot.filename,
  status: slot.status,
  priority: slot.priority,
  cat: slot.category,
  mb: slot.mb,
  mbleft: slot.mbleft,
  percentage: slot.percentage,
  timeleft: slot.timeleft,
})

const queueResultFromApi = (response: typeof QueueResponseApiSchema.Type): QueueResult => {
  const slots = response.queue.slots.map(queueSlotFromApi)
  return {
    status: fromNullable(response.queue.status),
    paused: fromNullable(response.queue.paused),
    speed: fromNullable(response.queue.speed),
    speedlimit: fromNullable(response.queue.speedlimit),
    timeleft: fromNullable(response.queue.timeleft),
    mb: fromNullable(response.queue.mb),
    mbleft: fromNullable(response.queue.mbleft),
    noofslots: fromNullable(response.queue.noofslots),
    count: slots.length,
    totalRecords:
      fromNullable(response.queue.noofslots_total) ?? fromNullable(response.queue.noofslots) ?? slots.length,
    slots,
  }
}

const queueResultToApi = (result: QueueResult): typeof QueueResponseApiSchema.Type => ({
  queue: {
    status: result.status,
    paused: result.paused,
    speed: result.speed,
    speedlimit: result.speedlimit,
    timeleft: result.timeleft,
    mb: result.mb,
    mbleft: result.mbleft,
    noofslots: result.noofslots,
    noofslots_total: result.totalRecords,
    slots: result.slots.map(queueSlotToApi),
  },
})

export const QueueResponseSchema = QueueResponseApiSchema.pipe(
  Schema.decodeTo(DomainQueueResultSchema, {
    decode: SchemaGetter.transform(queueResultFromApi),
    encode: SchemaGetter.transform(queueResultToApi),
  })
)

const historySlotFromApi = (slot: typeof HistorySlotApiSchema.Type): HistorySlot => ({
  nzoId: slot.nzo_id,
  name: slot.name,
  status: fromNullable(slot.status),
  category: fromNullable(slot.category),
  bytes: fromNullable(slot.bytes),
  failMessage: fromNullable(slot.fail_message),
  storage: fromNullable(slot.storage),
  completed: fromNullable(slot.completed),
})

const historySlotToApi = (slot: HistorySlot): typeof HistorySlotApiSchema.Type => ({
  nzo_id: slot.nzoId,
  name: slot.name,
  status: slot.status,
  category: slot.category,
  bytes: slot.bytes,
  fail_message: slot.failMessage,
  storage: slot.storage,
  completed: slot.completed,
})

const historyResultFromApi = (response: typeof HistoryResponseApiSchema.Type): HistoryResult => {
  const slots = response.history.slots.map(historySlotFromApi)
  return {
    totalSize: fromNullable(response.history.total_size),
    monthSize: fromNullable(response.history.month_size),
    weekSize: fromNullable(response.history.week_size),
    daySize: fromNullable(response.history.day_size),
    noofslots: fromNullable(response.history.noofslots),
    count: slots.length,
    totalRecords: fromNullable(response.history.noofslots) ?? slots.length,
    slots,
  }
}

const historyResultToApi = (result: HistoryResult): typeof HistoryResponseApiSchema.Type => ({
  history: {
    total_size: result.totalSize,
    month_size: result.monthSize,
    week_size: result.weekSize,
    day_size: result.daySize,
    noofslots: result.totalRecords,
    slots: result.slots.map(historySlotToApi),
  },
})

export const HistoryResponseSchema = HistoryResponseApiSchema.pipe(
  Schema.decodeTo(DomainHistoryResultSchema, {
    decode: SchemaGetter.transform(historyResultFromApi),
    encode: SchemaGetter.transform(historyResultToApi),
  })
)

const actionOk = (status: boolean | string | null | undefined): boolean => status === true || status === 'true'

export const ActionResponseSchema = ActionResponseApiSchema.pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((response: typeof ActionResponseApiSchema.Type) => actionOk(response.status)),
    encode: SchemaGetter.transform((ok: boolean) => ({ status: ok })),
  })
)

const serverUsageFromApi = (usage: typeof ServerUsageApiSchema.Type): ServerUsage => ({
  total: fromNullable(usage.total),
  month: fromNullable(usage.month),
  week: fromNullable(usage.week),
  day: fromNullable(usage.day),
})

const serverUsageToApi = (usage: ServerUsage): typeof ServerUsageApiSchema.Type => ({
  total: usage.total,
  month: usage.month,
  week: usage.week,
  day: usage.day,
})

const serversFromApi = (
  servers: Readonly<Record<string, typeof ServerUsageApiSchema.Type>>
): Readonly<Record<string, ServerUsage>> =>
  Object.fromEntries(Object.entries(servers).map(([name, usage]) => [name, serverUsageFromApi(usage)]))

const serversToApi = (
  servers: Readonly<Record<string, ServerUsage>>
): Readonly<Record<string, typeof ServerUsageApiSchema.Type>> =>
  Object.fromEntries(Object.entries(servers).map(([name, usage]) => [name, serverUsageToApi(usage)]))

const serverStatsFromApi = (stats: typeof ServerStatsApiSchema.Type): ServerStats => ({
  total: fromNullable(stats.total),
  month: fromNullable(stats.month),
  week: fromNullable(stats.week),
  day: fromNullable(stats.day),
  servers: serversFromApi(stats.servers),
})

const serverStatsToApi = (stats: ServerStats): typeof ServerStatsApiSchema.Type => ({
  total: stats.total,
  month: stats.month,
  week: stats.week,
  day: stats.day,
  servers: serversToApi(stats.servers),
})

export const ServerStatsSchema = ServerStatsApiSchema.pipe(
  Schema.decodeTo(DomainServerStatsSchema, {
    decode: SchemaGetter.transform(serverStatsFromApi),
    encode: SchemaGetter.transform(serverStatsToApi),
  })
)
