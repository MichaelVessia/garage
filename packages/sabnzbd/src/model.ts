import * as Schema from 'effect/Schema'

const OptionalString = Schema.optional(Schema.String)
const OptionalNumber = Schema.optional(Schema.Number)
const OptionalBoolean = Schema.optional(Schema.Boolean)
const OptionalStringArray = Schema.Array(Schema.String).pipe(Schema.optional)

const SabnzbdConfigValue = Schema.Struct({
  url: Schema.String,
  apiKey: Schema.RedactedFromValue(Schema.String),
})
export type SabnzbdConfigValue = typeof SabnzbdConfigValue.Type

export const SystemStatus = Schema.Struct({
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
export type SystemStatus = typeof SystemStatus.Type

export const VersionResult = Schema.Struct({ version: Schema.String })
export type VersionResult = typeof VersionResult.Type

const QueueSlot = Schema.Struct({
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
export type QueueSlot = typeof QueueSlot.Type

export const QueueResult = Schema.Struct({
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
  slots: Schema.Array(QueueSlot),
})
export type QueueResult = typeof QueueResult.Type

const HistorySlot = Schema.Struct({
  nzoId: Schema.String,
  name: Schema.String,
  status: OptionalString,
  category: OptionalString,
  bytes: OptionalNumber,
  failMessage: OptionalString,
  storage: OptionalString,
  completed: OptionalNumber,
})
export type HistorySlot = typeof HistorySlot.Type

export const HistoryResult = Schema.Struct({
  totalSize: OptionalString,
  monthSize: OptionalString,
  weekSize: OptionalString,
  daySize: OptionalString,
  noofslots: OptionalNumber,
  count: Schema.Number,
  totalRecords: Schema.Number,
  slots: Schema.Array(HistorySlot),
})
export type HistoryResult = typeof HistoryResult.Type

const SabnzbdAction = Schema.Literals(['pause', 'resume', 'delete'])
export type SabnzbdAction = typeof SabnzbdAction.Type

export const ActionResult = Schema.Struct({
  action: SabnzbdAction,
  ok: Schema.Boolean,
  nzoId: OptionalString,
  deleteFiles: OptionalBoolean,
})
export type ActionResult = typeof ActionResult.Type

const ServerUsage = Schema.Struct({
  total: OptionalNumber,
  month: OptionalNumber,
  week: OptionalNumber,
  day: OptionalNumber,
})
export type ServerUsage = typeof ServerUsage.Type

export const ServerStats = Schema.Struct({
  ...ServerUsage.fields,
  servers: Schema.Record(Schema.String, ServerUsage),
})
export type ServerStats = typeof ServerStats.Type

const LimitOptions = Schema.Struct({ limit: Schema.Number })
export type LimitOptions = typeof LimitOptions.Type

export const DeleteOptions = Schema.Struct({ deleteFiles: Schema.Boolean })
export type DeleteOptions = typeof DeleteOptions.Type
