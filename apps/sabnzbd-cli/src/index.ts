import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  NextAction,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  defaultHistoryLimit,
  defaultLimit,
  deleteConfirmationRequired,
  deleteQueueItem,
  history,
  pause,
  queue,
  resume,
  serverStats,
  status,
  version,
} from '@garage/sabnzbd'
import type {
  ActionResult,
  HistoryResult,
  QueueResult,
  SabnzbdApi,
  SabnzbdConfig,
  SabnzbdError,
  ServerStats,
  SystemStatus,
  VersionResult,
} from '@garage/sabnzbd'
import * as Effect from 'effect/Effect'

import {
  confirmDeleteFilesFlag,
  deleteKeepFilesCommandTemplate,
  envNextAction,
  filesFlag,
  historyLimitCommandTemplate,
  historyCommandTemplate,
  limitFlag,
  queueLimitCommandTemplate,
  queueCommandTemplate,
  rootCommand,
  statusCommandTemplate,
  showCommandsAction,
  deleteCommandTemplate,
  pauseCommandTemplate,
  resumeCommandTemplate,
  serverStatsCommandTemplate,
  versionCommandTemplate,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type SabnzbdCliResult =
  | RootResult
  | SystemStatus
  | VersionResult
  | QueueResult
  | HistoryResult
  | ActionResult
  | ServerStats

export type SabnzbdCliEnvelope = SuccessEnvelope<SabnzbdCliResult> | ErrorEnvelope
type SabnzbdCliError = SabnzbdError | CliUsageError
type SabnzbdCliContext = SabnzbdApi | SabnzbdConfig
type SabnzbdInvocation = CommandInvocation<SabnzbdCliResult, SabnzbdCliError, SabnzbdCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, SabnzbdCliContext> =>
  status.pipe(
    Effect.match({
      onFailure: (error) => {
        const health =
          error.code === 'SABNZBD_ENV_MISSING'
            ? { configured: false }
            : { configured: true, reachable: false, errorCode: error.code }

        return successEnvelope({
          command,
          result: {
            name: 'sabnzbd',
            description: 'Agent-first SABnzbd CLI',
            commands: commandTree,
            health,
          },
          nextActions: error.code === 'SABNZBD_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        })
      },
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'sabnzbd',
            description: 'Agent-first SABnzbd CLI',
            commands: commandTree,
            health: {
              configured: true,
              ...(result.version === undefined ? {} : { version: result.version }),
              ...(result.paused === undefined ? {} : { paused: result.paused }),
            },
          },
        }),
    })
  )

const limitFromArgs = (
  { args, parseFlags, parsePositiveInteger }: SabnzbdInvocation,
  defaultValue: number,
  positionalAllowed: boolean
): Effect.Effect<number, SabnzbdCliError> =>
  parseFlags(args, { valueFlags: [limitFlag] }).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(limitFlag)
      if (value !== undefined) {
        return parsePositiveInteger(value, 'limit')
      }

      const [positional] = parsed.positionals
      if (positionalAllowed && positional !== undefined) {
        return parsePositiveInteger(positional, 'limit')
      }

      return Effect.succeed(defaultValue)
    })
  )

const listNextAction = (command: string, description: string, defaultLimitValue: number): ReadonlyArray<NextAction> => [
  {
    command,
    description,
    params: { limit: { default: defaultLimitValue, description: 'Maximum records to return' } },
  },
]

const queueCommand = (invocation: SabnzbdInvocation) =>
  invocation.recover(
    limitFromArgs(invocation, defaultLimit, false).pipe(
      Effect.flatMap((limit) =>
        invocation.wrap(queue({ limit }), () =>
          Effect.succeed(listNextAction(queueLimitCommandTemplate, 'Return more queue records', defaultLimit))
        )
      )
    )
  )

const historyCommand = (invocation: SabnzbdInvocation) =>
  invocation.recover(
    limitFromArgs(invocation, defaultHistoryLimit, true).pipe(
      Effect.flatMap((limit) =>
        invocation.wrap(history({ limit }), () =>
          Effect.succeed(
            listNextAction(historyLimitCommandTemplate, 'Return more history records', defaultHistoryLimit)
          )
        )
      )
    )
  )

const deleteCommand = ({ args, errorToEnvelope, parseFlags, recover, usageError, wrap }: SabnzbdInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [filesFlag, confirmDeleteFilesFlag] })
      const [nzoId] = parsed.positionals

      if (nzoId === undefined) {
        return yield* wrap(Effect.fail(usageError('nzo-id is required')))
      }

      const deleteFiles = parsed.booleans.has(filesFlag)
      if (deleteFiles && !parsed.booleans.has(confirmDeleteFilesFlag)) {
        return errorToEnvelope(deleteConfirmationRequired(), [
          {
            command: deleteKeepFilesCommandTemplate,
            description: 'Delete the queue item while keeping downloaded files',
            params: { 'nzo-id': { value: nzoId, description: 'SABnzbd NZO ID' } },
          },
        ])
      }

      return yield* wrap(deleteQueueItem(nzoId, { deleteFiles }))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<CommandDefinition<SabnzbdCliResult, SabnzbdCliError, SabnzbdCliContext>> = [
  {
    name: 'status',
    command: statusCommandTemplate,
    description: 'Return the SABnzbd full status summary',
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'version',
    command: versionCommandTemplate,
    description: 'Return the SABnzbd version',
    handle: ({ wrap }) => wrap(version),
  },
  {
    name: 'queue',
    command: queueCommandTemplate,
    description: 'Return active download queue records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum queue slots to return', default: defaultLimit }],
    handle: queueCommand,
  },
  {
    name: 'history',
    command: historyCommandTemplate,
    description: 'Return recent download history records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum history slots to return', default: defaultHistoryLimit }],
    handle: historyCommand,
  },
  {
    name: 'pause',
    command: pauseCommandTemplate,
    description: 'Pause the SABnzbd queue',
    handle: ({ wrap }) => wrap(pause),
  },
  {
    name: 'resume',
    command: resumeCommandTemplate,
    description: 'Resume the SABnzbd queue',
    handle: ({ wrap }) => wrap(resume),
  },
  {
    name: 'delete',
    command: deleteCommandTemplate,
    description: 'Delete a queue item',
    flags: [
      { name: filesFlag, description: 'Delete downloaded files too' },
      { name: confirmDeleteFilesFlag, description: 'Confirm deletion of downloaded files from disk' },
    ],
    handle: deleteCommand,
  },
  {
    name: 'server-stats',
    command: serverStatsCommandTemplate,
    description: 'Return download totals by day, week, month, and server',
    handle: ({ wrap }) => wrap(serverStats),
  },
]

const execute = createCliRunner<SabnzbdCliResult, SabnzbdCliError, SabnzbdCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeSabnzbd = (
  args: ReadonlyArray<string>
): Effect.Effect<SabnzbdCliEnvelope, never, SabnzbdCliContext> => execute(args)
