import {
  ActionResult,
  HistoryResult,
  QueueResult,
  SabnzbdApi,
  ServerStats,
  SystemStatus,
  VersionResult,
  defaultHistoryLimit,
  defaultLimit,
  deleteQueueItem,
  history,
  pause,
  queue,
  resume,
  serverStats,
  status,
  version,
} from '@garage/sabnzbd'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Tool from 'effect/unstable/ai/Tool'
import * as Toolkit from 'effect/unstable/ai/Toolkit'

import { GarageMcpToolError, garageMcpToolError, sabnzbdToolError } from '../errors.js'

const ListLimit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })).annotate({
  description: 'Maximum number of records to return, from 1 through 100',
})

const QueueParameters = Schema.Struct({
  limit: ListLimit.pipe(Schema.withDecodingDefaultKey(Effect.succeed(defaultLimit))),
})

const HistoryParameters = Schema.Struct({
  limit: ListLimit.pipe(Schema.withDecodingDefaultKey(Effect.succeed(defaultHistoryLimit))),
})

const DeleteParameters = Schema.Struct({
  nzoId: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: 'SABnzbd NZO identifier for one queue item',
  }),
  deleteFiles: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))).annotate({
    description: 'Also delete downloaded data from disk',
  }),
  confirmDeleteFiles: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))).annotate({
    description: 'Explicit second confirmation required when deleteFiles is true',
  }),
})

const toolAnnotations = <
  Name extends string,
  Config extends {
    readonly parameters: Schema.Constraint
    readonly success: Schema.Constraint
    readonly failure: Schema.Constraint
    readonly failureMode: Tool.FailureMode
  },
  Requirements,
>(
  tool: Tool.Tool<Name, Config, Requirements>,
  annotations: {
    readonly title: string
    readonly readOnly: boolean
    readonly destructive: boolean
    readonly idempotent: boolean
  }
): Tool.Tool<Name, Config, Requirements> =>
  tool
    .annotate(Tool.Title, annotations.title)
    .annotate(Tool.Readonly, annotations.readOnly)
    .annotate(Tool.Destructive, annotations.destructive)
    .annotate(Tool.Idempotent, annotations.idempotent)
    .annotate(Tool.OpenWorld, false)

const readToolAnnotations = <
  Name extends string,
  Config extends {
    readonly parameters: Schema.Constraint
    readonly success: Schema.Constraint
    readonly failure: Schema.Constraint
    readonly failureMode: Tool.FailureMode
  },
  Requirements,
>(
  tool: Tool.Tool<Name, Config, Requirements>,
  title: string
): Tool.Tool<Name, Config, Requirements> =>
  toolAnnotations(tool, { title, readOnly: true, destructive: false, idempotent: true })

/** Return the SABnzbd application's full status summary. */
export const SabnzbdStatusTool = readToolAnnotations(
  Tool.make('sabnzbd_status', {
    description: 'Return SABnzbd application status, pause state, storage, speed limits, and warnings.',
    success: SystemStatus,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  'SABnzbd Status'
)

/** Return the SABnzbd application version. */
export const SabnzbdVersionTool = readToolAnnotations(
  Tool.make('sabnzbd_version', {
    description: 'Return the running SABnzbd application version.',
    success: VersionResult,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  'SABnzbd Version'
)

/** Return a bounded window of active SABnzbd queue slots. */
export const SabnzbdQueueTool = readToolAnnotations(
  Tool.make('sabnzbd_queue', {
    description: 'Return up to 100 active SABnzbd queue slots and queue totals.',
    parameters: QueueParameters,
    success: QueueResult,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  'SABnzbd Queue'
)

/** Return a bounded window of recent SABnzbd history slots. */
export const SabnzbdHistoryTool = readToolAnnotations(
  Tool.make('sabnzbd_history', {
    description: 'Return up to 100 recent SABnzbd history slots and history totals.',
    parameters: HistoryParameters,
    success: HistoryResult,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  'SABnzbd History'
)

/** Return SABnzbd usage totals grouped by configured news server. */
export const SabnzbdServerStatsTool = readToolAnnotations(
  Tool.make('sabnzbd_server_stats', {
    description: 'Return SABnzbd download totals by day, week, month, and configured news server.',
    success: ServerStats,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  'SABnzbd Server Statistics'
)

/** Pause the global SABnzbd queue. */
export const SabnzbdPauseTool = toolAnnotations(
  Tool.make('sabnzbd_pause', {
    description: 'Pause the global SABnzbd download queue.',
    success: ActionResult,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  { title: 'Pause SABnzbd Queue', readOnly: false, destructive: false, idempotent: true }
)

/** Resume the global SABnzbd queue. */
export const SabnzbdResumeTool = toolAnnotations(
  Tool.make('sabnzbd_resume', {
    description: 'Resume the global SABnzbd download queue.',
    success: ActionResult,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  { title: 'Resume SABnzbd Queue', readOnly: false, destructive: false, idempotent: true }
)

/** Delete one SABnzbd queue item, optionally with its downloaded data. */
export const SabnzbdDeleteTool = toolAnnotations(
  Tool.make('sabnzbd_delete', {
    description:
      'Delete one SABnzbd queue item. Deleting downloaded data additionally requires deleteFiles and confirmDeleteFiles.',
    parameters: DeleteParameters,
    success: ActionResult,
    failure: GarageMcpToolError,
    dependencies: [SabnzbdApi],
  }),
  { title: 'Delete SABnzbd Queue Item', readOnly: false, destructive: true, idempotent: false }
)

/** Typed collection of the SABnzbd MCP tools. */
export const SabnzbdToolkit = Toolkit.make(
  SabnzbdStatusTool,
  SabnzbdVersionTool,
  SabnzbdQueueTool,
  SabnzbdHistoryTool,
  SabnzbdServerStatsTool,
  SabnzbdPauseTool,
  SabnzbdResumeTool,
  SabnzbdDeleteTool
)

/** Handler layer adapting SABnzbd MCP tools to package domain operations. */
export const SabnzbdToolkitHandlers = SabnzbdToolkit.toLayer(
  SabnzbdToolkit.of({
    sabnzbd_status: () => status.pipe(Effect.mapError(sabnzbdToolError)),
    sabnzbd_version: () => version.pipe(Effect.mapError(sabnzbdToolError)),
    sabnzbd_queue: ({ limit }) => queue({ limit }).pipe(Effect.mapError(sabnzbdToolError)),
    sabnzbd_history: ({ limit }) => history({ limit }).pipe(Effect.mapError(sabnzbdToolError)),
    sabnzbd_server_stats: () => serverStats.pipe(Effect.mapError(sabnzbdToolError)),
    sabnzbd_pause: () => pause.pipe(Effect.mapError(sabnzbdToolError)),
    sabnzbd_resume: () => resume.pipe(Effect.mapError(sabnzbdToolError)),
    sabnzbd_delete: ({ nzoId, deleteFiles, confirmDeleteFiles }) =>
      deleteFiles && !confirmDeleteFiles
        ? Effect.fail(
            garageMcpToolError({
              code: 'SABNZBD_DELETE_CONFIRMATION_REQUIRED',
              message: 'Deleting downloaded data requires confirmDeleteFiles to be true.',
              fix: 'Set confirmDeleteFiles only after confirming that downloaded data should be removed from disk.',
            })
          )
        : deleteQueueItem(nzoId, { deleteFiles }).pipe(Effect.mapError(sabnzbdToolError)),
  })
)
