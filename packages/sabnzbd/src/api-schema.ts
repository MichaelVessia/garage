import * as R from 'effect/Record'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

import {
  HistoryResult as DomainHistoryResult,
  QueueResult as DomainQueueResult,
  ServerStats as DomainServerStats,
  SystemStatus as DomainSystemStatus,
  VersionResult as DomainVersionResult,
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

const NullableString = Schema.NullOr(Schema.String).pipe(Schema.optional)
const NullableNumber = Schema.NullOr(Schema.Number).pipe(Schema.optional)
const NullableBoolean = Schema.NullOr(Schema.Boolean).pipe(Schema.optional)
const NullableStringArray = Schema.Array(Schema.String).pipe(Schema.NullOr, Schema.optional)
const ActionStatusApi = Schema.Union([Schema.Boolean, Schema.String]).pipe(Schema.NullOr, Schema.optional)

const StatusApi = Schema.Struct({
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

const FullStatusResponseApi = Schema.Struct({
  status: StatusApi,
})

const VersionResponseApi = Schema.Struct({
  version: Schema.String,
})

const QueueSlotApi = Schema.Struct({
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

const QueueApi = Schema.Struct({
  status: NullableString,
  paused: NullableBoolean,
  speed: NullableString,
  speedlimit: NullableString,
  timeleft: NullableString,
  mb: NullableString,
  mbleft: NullableString,
  noofslots: NullableNumber,
  noofslots_total: NullableNumber,
  slots: Schema.Array(QueueSlotApi),
})

const QueueResponseApi = Schema.Struct({
  queue: QueueApi,
})

const HistorySlotApi = Schema.Struct({
  nzo_id: Schema.String,
  name: Schema.String,
  status: NullableString,
  category: NullableString,
  bytes: NullableNumber,
  fail_message: NullableString,
  storage: NullableString,
  completed: NullableNumber,
})

const HistoryApi = Schema.Struct({
  total_size: NullableString,
  month_size: NullableString,
  week_size: NullableString,
  day_size: NullableString,
  noofslots: NullableNumber,
  slots: Schema.Array(HistorySlotApi),
})

const HistoryResponseApi = Schema.Struct({
  history: HistoryApi,
})

const ActionResponseApi = Schema.Struct({
  status: ActionStatusApi,
})

const ServerUsageApi = Schema.Struct({
  total: NullableNumber,
  month: NullableNumber,
  week: NullableNumber,
  day: NullableNumber,
})

const ServerStatsApi = Schema.Struct({
  total: NullableNumber,
  month: NullableNumber,
  week: NullableNumber,
  day: NullableNumber,
  servers: Schema.Record(Schema.String, ServerUsageApi),
})

// oxlint-disable-next-line effect/prefer-option-over-null -- boundary coalesce: wire values decode as `A | null | undefined` (Schema.optional(NullOr)) and the domain model intentionally uses `A | undefined` (Schema.optional) so the agent-facing CLI emits clean JSON rather than Option's `{ _tag, value }` envelope.
const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

const systemStatusFromApi = (status: typeof StatusApi.Type): SystemStatus => ({
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

const systemStatusToApi = (status: SystemStatus): typeof StatusApi.Type => ({
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

export const StatusSchema = StatusApi.pipe(
  Schema.decodeTo(DomainSystemStatus, {
    decode: SchemaGetter.transform(systemStatusFromApi),
    encode: SchemaGetter.transform(systemStatusToApi),
  })
)

const fullStatusFromApi = (response: typeof FullStatusResponseApi.Type): SystemStatus =>
  systemStatusFromApi(response.status)

const fullStatusToApi = (status: SystemStatus): typeof FullStatusResponseApi.Type => ({
  status: systemStatusToApi(status),
})

export const FullStatusResponseSchema = FullStatusResponseApi.pipe(
  Schema.decodeTo(DomainSystemStatus, {
    decode: SchemaGetter.transform(fullStatusFromApi),
    encode: SchemaGetter.transform(fullStatusToApi),
  })
)

export const VersionResponseSchema = VersionResponseApi.pipe(Schema.decodeTo(DomainVersionResult))

const queueSlotFromApi = (slot: typeof QueueSlotApi.Type): QueueSlot => ({
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

const queueSlotToApi = (slot: QueueSlot): typeof QueueSlotApi.Type => ({
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

const queueResultFromApi = (response: typeof QueueResponseApi.Type): QueueResult => {
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

const queueResultToApi = (result: QueueResult): typeof QueueResponseApi.Type => ({
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

export const QueueResponseSchema = QueueResponseApi.pipe(
  Schema.decodeTo(DomainQueueResult, {
    decode: SchemaGetter.transform(queueResultFromApi),
    encode: SchemaGetter.transform(queueResultToApi),
  })
)

const historySlotFromApi = (slot: typeof HistorySlotApi.Type): HistorySlot => ({
  nzoId: slot.nzo_id,
  name: slot.name,
  status: fromNullable(slot.status),
  category: fromNullable(slot.category),
  bytes: fromNullable(slot.bytes),
  failMessage: fromNullable(slot.fail_message),
  storage: fromNullable(slot.storage),
  completed: fromNullable(slot.completed),
})

const historySlotToApi = (slot: HistorySlot): typeof HistorySlotApi.Type => ({
  nzo_id: slot.nzoId,
  name: slot.name,
  status: slot.status,
  category: slot.category,
  bytes: slot.bytes,
  fail_message: slot.failMessage,
  storage: slot.storage,
  completed: slot.completed,
})

const historyResultFromApi = (response: typeof HistoryResponseApi.Type): HistoryResult => {
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

const historyResultToApi = (result: HistoryResult): typeof HistoryResponseApi.Type => ({
  history: {
    total_size: result.totalSize,
    month_size: result.monthSize,
    week_size: result.weekSize,
    day_size: result.daySize,
    noofslots: result.totalRecords,
    slots: result.slots.map(historySlotToApi),
  },
})

export const HistoryResponseSchema = HistoryResponseApi.pipe(
  Schema.decodeTo(DomainHistoryResult, {
    decode: SchemaGetter.transform(historyResultFromApi),
    encode: SchemaGetter.transform(historyResultToApi),
  })
)

// oxlint-disable-next-line effect/prefer-option-over-null -- SABnzbd action responses decode to `boolean | string | null | undefined` on the wire; this guard collapses that raw union to a boolean and never surfaces the absence to callers, so Option would add no value.
const actionOk = (status: boolean | string | null | undefined): boolean => status === true || status === 'true'

export const ActionResponseSchema = ActionResponseApi.pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((response: typeof ActionResponseApi.Type) => actionOk(response.status)),
    encode: SchemaGetter.transform((ok: boolean) => ({ status: ok })),
  })
)

const serverUsageFromApi = (usage: typeof ServerUsageApi.Type): ServerUsage => ({
  total: fromNullable(usage.total),
  month: fromNullable(usage.month),
  week: fromNullable(usage.week),
  day: fromNullable(usage.day),
})

const serverUsageToApi = (usage: ServerUsage): typeof ServerUsageApi.Type => ({
  total: usage.total,
  month: usage.month,
  week: usage.week,
  day: usage.day,
})

const serversFromApi = (
  servers: Readonly<Record<string, typeof ServerUsageApi.Type>>
): Readonly<Record<string, ServerUsage>> => R.map(servers, serverUsageFromApi)

const serversToApi = (
  servers: Readonly<Record<string, ServerUsage>>
): Readonly<Record<string, typeof ServerUsageApi.Type>> => R.map(servers, serverUsageToApi)

const serverStatsFromApi = (stats: typeof ServerStatsApi.Type): ServerStats => ({
  total: fromNullable(stats.total),
  month: fromNullable(stats.month),
  week: fromNullable(stats.week),
  day: fromNullable(stats.day),
  servers: serversFromApi(stats.servers),
})

const serverStatsToApi = (stats: ServerStats): typeof ServerStatsApi.Type => ({
  total: stats.total,
  month: stats.month,
  week: stats.week,
  day: stats.day,
  servers: serversToApi(stats.servers),
})

export const ServerStatsSchema = ServerStatsApi.pipe(
  Schema.decodeTo(DomainServerStats, {
    decode: SchemaGetter.transform(serverStatsFromApi),
    encode: SchemaGetter.transform(serverStatsToApi),
  })
)
