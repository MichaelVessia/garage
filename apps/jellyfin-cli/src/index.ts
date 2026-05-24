import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  confirmationRequired,
  defaultLimit,
  itemSearch,
  libraries,
  libraryStats,
  nowPlaying,
  recentlyAdded,
  runTask,
  scheduledTasks,
  sessions,
  status,
  users,
} from '@garage/jellyfin'
import type {
  ItemRecord,
  JellyfinApi,
  JellyfinConfig,
  JellyfinError,
  LibraryRecord,
  LibraryStats,
  ListResult,
  NowPlayingRecord,
  RunTaskResult,
  ScheduledTaskRecord,
  SessionRecord,
  SystemStatus,
  UserRecord,
} from '@garage/jellyfin'
import { Effect } from 'effect'

import { confirmRunTaskFlag, envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type JellyfinCliResult =
  | RootResult
  | SystemStatus
  | ListResult<UserRecord>
  | ListResult<LibraryRecord>
  | ListResult<SessionRecord>
  | ListResult<NowPlayingRecord>
  | ListResult<ItemRecord>
  | LibraryStats
  | ListResult<ScheduledTaskRecord>
  | RunTaskResult

export type JellyfinCliEnvelope = SuccessEnvelope<JellyfinCliResult> | ErrorEnvelope
type JellyfinCliError = JellyfinError | CliUsageError
type JellyfinCliContext = JellyfinApi | JellyfinConfig
type JellyfinInvocation = CommandInvocation<JellyfinCliResult, JellyfinCliError, JellyfinCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, JellyfinCliContext> =>
  status.pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'jellyfin',
            description: 'Agent-first Jellyfin CLI',
            commands: commandTree,
            health:
              error.code === 'JELLYFIN_ENV_MISSING'
                ? { configured: false }
                : { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: error.code === 'JELLYFIN_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        }),
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'jellyfin',
            description: 'Agent-first Jellyfin CLI',
            commands: commandTree,
            health: { configured: true, version: result.version, serverName: result.serverName },
          },
        }),
    })
  )

const limitCommand = <Result extends JellyfinCliResult>(
  { args, limitFromArgs, recover, wrap }: JellyfinInvocation,
  program: (limit: number) => Effect.Effect<Result, JellyfinError, JellyfinApi | JellyfinConfig>
) => recover(limitFromArgs(args, limitFlag, defaultLimit).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const itemSearchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: JellyfinInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(Effect.fail(usageError('query is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? defaultLimit : yield* parsePositiveInteger(value, 'limit')
      return yield* wrap(itemSearch({ query, limit }))
    })
  )

const runTaskCommand = ({ args, errorToEnvelope, parseFlags, recover, usageError, wrap }: JellyfinInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [confirmRunTaskFlag] })
      const [taskId] = parsed.positionals
      if (taskId === undefined) {
        return yield* wrap(Effect.fail(usageError('task-id is required')))
      }
      if (!parsed.booleans.has(confirmRunTaskFlag)) {
        return errorToEnvelope(confirmationRequired(), [
          {
            command: `${rootCommand} run-task <task-id> --confirm-run-task`,
            description: 'Run the scheduled task after user confirmation',
            params: { 'task-id': { value: taskId, description: 'Jellyfin scheduled task ID' } },
          },
        ])
      }
      return yield* wrap(runTask(taskId))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<CommandDefinition<JellyfinCliResult, JellyfinCliError, JellyfinCliContext>> = [
  {
    name: 'status',
    description: { command: `${rootCommand} status`, description: 'Return Jellyfin server status' },
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'users',
    description: { command: `${rootCommand} users`, description: 'Return Jellyfin users' },
    handle: ({ wrap }) => wrap(users),
  },
  {
    name: 'libraries',
    description: { command: `${rootCommand} libraries`, description: 'Return Jellyfin libraries' },
    handle: ({ wrap }) => wrap(libraries),
  },
  {
    name: 'sessions',
    description: { command: `${rootCommand} sessions`, description: 'Return active sessions' },
    handle: ({ wrap }) => wrap(sessions),
  },
  {
    name: 'now-playing',
    description: { command: `${rootCommand} now-playing`, description: 'Return sessions with active playback' },
    handle: ({ wrap }) => wrap(nowPlaying),
  },
  {
    name: 'recently-added',
    description: {
      command: `${rootCommand} recently-added [${limitFlag} <n>]`,
      description: 'Return recently added items',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: (invocation) => limitCommand(invocation, (limit) => recentlyAdded({ limit })),
  },
  {
    name: 'item-search',
    description: {
      command: `${rootCommand} item-search <query> [${limitFlag} <n>]`,
      description: 'Search movies, series, and episodes',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: itemSearchCommand,
  },
  {
    name: 'library-stats',
    description: { command: `${rootCommand} library-stats`, description: 'Return Jellyfin item counts' },
    handle: ({ wrap }) => wrap(libraryStats),
  },
  {
    name: 'scheduled-tasks',
    description: { command: `${rootCommand} scheduled-tasks`, description: 'Return scheduled tasks' },
    handle: ({ wrap }) => wrap(scheduledTasks),
  },
  {
    name: 'run-task',
    description: {
      command: `${rootCommand} run-task <task-id> [${confirmRunTaskFlag}]`,
      description: 'Start a scheduled task',
      flags: [{ name: confirmRunTaskFlag, description: 'Confirm scheduled task start' }],
    },
    handle: runTaskCommand,
  },
]

const execute = createCliRunner<JellyfinCliResult, JellyfinCliError, JellyfinCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeJellyfin = (
  args: ReadonlyArray<string>
): Effect.Effect<JellyfinCliEnvelope, never, JellyfinCliContext> => execute(args)
