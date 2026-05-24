import { Schema } from 'effect'

import type {
  ActionResult,
  HistoryResult,
  HistorySlot,
  QueueResult,
  QueueSlot,
  SabnzbdAction,
  ServerStats,
  ServerUsage,
  SystemStatus,
  VersionResult,
} from './model.js'

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableNumber = Schema.optional(Schema.NullOr(Schema.Number))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const NullableStringArray = Schema.optional(Schema.NullOr(Schema.Array(Schema.String)))
const ActionStatusSchema = Schema.optional(Schema.NullOr(Schema.Union([Schema.Boolean, Schema.String])))

export const StatusSchema = Schema.Struct({
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

export const FullStatusResponseSchema = Schema.Struct({
  status: StatusSchema,
})

export const VersionResponseSchema = Schema.Struct({
  version: Schema.String,
})

const QueueSlotSchema = Schema.Struct({
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
  slots: Schema.Array(QueueSlotSchema),
})

export const QueueResponseSchema = Schema.Struct({
  queue: QueueSchema,
})

const HistorySlotSchema = Schema.Struct({
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
  slots: Schema.Array(HistorySlotSchema),
})

export const HistoryResponseSchema = Schema.Struct({
  history: HistorySchema,
})

export const ActionResponseSchema = Schema.Struct({
  status: ActionStatusSchema,
})

const ServerUsageSchema = Schema.Struct({
  total: NullableNumber,
  month: NullableNumber,
  week: NullableNumber,
  day: NullableNumber,
})

export const ServerStatsSchema = Schema.Struct({
  total: NullableNumber,
  month: NullableNumber,
  week: NullableNumber,
  day: NullableNumber,
  servers: Schema.Record(Schema.String, ServerUsageSchema),
})

const fromNullable = <A>(value: A | null | undefined): A | undefined => (value === null ? undefined : value)

export const toSystemStatus = (status: typeof StatusSchema.Type): SystemStatus => ({
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

export const toVersionResult = (response: typeof VersionResponseSchema.Type): VersionResult => ({
  version: response.version,
})

export const toQueueSlot = (slot: typeof QueueSlotSchema.Type): QueueSlot => ({
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

export const toQueueResult = (response: typeof QueueResponseSchema.Type): QueueResult => {
  const slots = response.queue.slots.map(toQueueSlot)
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

export const toHistorySlot = (slot: typeof HistorySlotSchema.Type): HistorySlot => ({
  nzoId: slot.nzo_id,
  name: slot.name,
  status: fromNullable(slot.status),
  category: fromNullable(slot.category),
  bytes: fromNullable(slot.bytes),
  failMessage: fromNullable(slot.fail_message),
  storage: fromNullable(slot.storage),
  completed: fromNullable(slot.completed),
})

export const toHistoryResult = (response: typeof HistoryResponseSchema.Type): HistoryResult => {
  const slots = response.history.slots.map(toHistorySlot)
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

const actionOk = (status: boolean | string | null | undefined): boolean => status !== false && status !== 'false'

export const toActionResult = (
  action: SabnzbdAction,
  response: typeof ActionResponseSchema.Type,
  nzoId?: string,
  deleteFiles?: boolean
): ActionResult => ({
  action,
  ok: actionOk(response.status),
  nzoId,
  deleteFiles,
})

const toServerUsage = (usage: typeof ServerUsageSchema.Type): ServerUsage => ({
  total: fromNullable(usage.total),
  month: fromNullable(usage.month),
  week: fromNullable(usage.week),
  day: fromNullable(usage.day),
})

const toServers = (
  servers: Readonly<Record<string, typeof ServerUsageSchema.Type>>
): Readonly<Record<string, ServerUsage>> =>
  Object.fromEntries(Object.entries(servers).map(([name, usage]) => [name, toServerUsage(usage)]))

export const toServerStats = (stats: typeof ServerStatsSchema.Type): ServerStats => ({
  total: fromNullable(stats.total),
  month: fromNullable(stats.month),
  week: fromNullable(stats.week),
  day: fromNullable(stats.day),
  servers: toServers(stats.servers),
})
