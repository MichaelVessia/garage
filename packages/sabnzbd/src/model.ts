import { Schema } from 'effect'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String))

export const SabnzbdConfigValueSchema = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.String,
})
export type SabnzbdConfigValue = typeof SabnzbdConfigValueSchema.Type

export const SystemStatusSchema = Schema.Struct({
  version: OptionalString,
  uptime: OptionalString,
  paused: OptionalBoolean,
  pausedAll: OptionalBoolean,
  speedlimit: OptionalString,
  speedlimitAbs: OptionalString,
  diskspace1Norm: OptionalString,
  diskspace2Norm: OptionalString,
  haveWarnings: OptionalBoolean,
  warnings: OptionalStringArray,
  newRelease: OptionalString,
})
export type SystemStatus = typeof SystemStatusSchema.Type

export const VersionResultSchema = Schema.Struct({ version: Schema.String })
export type VersionResult = typeof VersionResultSchema.Type

export const QueueSlotSchema = Schema.Struct({
  nzoId: Schema.String,
  filename: Schema.String,
  status: OptionalString,
  priority: OptionalString,
  category: OptionalString,
  mb: OptionalString,
  mbleft: OptionalString,
  percentage: OptionalString,
  timeleft: OptionalString,
})
export type QueueSlot = typeof QueueSlotSchema.Type

export const QueueResultSchema = Schema.Struct({
  status: OptionalString,
  paused: OptionalBoolean,
  speed: OptionalString,
  speedlimit: OptionalString,
  timeleft: OptionalString,
  mb: OptionalString,
  mbleft: OptionalString,
  noofslots: OptionalNumber,
  count: Schema.Number,
  totalRecords: Schema.Number,
  slots: Schema.Array(QueueSlotSchema),
})
export type QueueResult = typeof QueueResultSchema.Type

export const HistorySlotSchema = Schema.Struct({
  nzoId: Schema.String,
  name: Schema.String,
  status: OptionalString,
  category: OptionalString,
  bytes: OptionalNumber,
  failMessage: OptionalString,
  storage: OptionalString,
  completed: OptionalNumber,
})
export type HistorySlot = typeof HistorySlotSchema.Type

export const HistoryResultSchema = Schema.Struct({
  totalSize: OptionalString,
  monthSize: OptionalString,
  weekSize: OptionalString,
  daySize: OptionalString,
  noofslots: OptionalNumber,
  count: Schema.Number,
  totalRecords: Schema.Number,
  slots: Schema.Array(HistorySlotSchema),
})
export type HistoryResult = typeof HistoryResultSchema.Type

export const SabnzbdActionSchema = Schema.Literals(['pause', 'resume', 'delete'])
export type SabnzbdAction = typeof SabnzbdActionSchema.Type

export const ActionResultSchema = Schema.Struct({
  action: SabnzbdActionSchema,
  ok: Schema.Boolean,
  nzoId: OptionalString,
  deleteFiles: OptionalBoolean,
})
export type ActionResult = typeof ActionResultSchema.Type

export const ServerUsageSchema = Schema.Struct({
  total: OptionalNumber,
  month: OptionalNumber,
  week: OptionalNumber,
  day: OptionalNumber,
})
export type ServerUsage = typeof ServerUsageSchema.Type

export const ServerStatsSchema = Schema.Struct({
  ...ServerUsageSchema.fields,
  servers: Schema.Record(Schema.String, ServerUsageSchema),
})
export type ServerStats = typeof ServerStatsSchema.Type

export const LimitOptionsSchema = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptionsSchema.Type

export const DeleteOptionsSchema = Schema.Struct({ deleteFiles: Schema.Boolean })
export type DeleteOptions = typeof DeleteOptionsSchema.Type
