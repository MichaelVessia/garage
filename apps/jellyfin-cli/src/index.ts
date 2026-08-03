import { createCliRunner, createCliUsageError, makeRoot } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  NextAction,
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
import * as Effect from 'effect/Effect'
import * as Str from 'effect/String'

import {
  confirmRunTaskFlag,
  envNextAction,
  limitFlag,
  mediaUserNextAction,
  rootCommand,
  showCommandsAction,
} from './command-tree.js'
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
type JellyfinCliContext = JellyfinApi
type JellyfinInvocation = CommandInvocation<JellyfinCliResult, JellyfinCliError, JellyfinCliContext>

const nextActionsFor = (error: JellyfinCliError): ReadonlyArray<NextAction> =>
  error.code === 'JELLYFIN_USER_ID_INVALID' ||
  error.code === 'JELLYFIN_NO_ENABLED_ADMINISTRATOR' ||
  error.code === 'JELLYFIN_AMBIGUOUS_ADMINISTRATOR'
    ? [mediaUserNextAction]
    : [showCommandsAction]

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, JellyfinCliContext> =>
  makeRoot({
    command,
    commandTree,
    name: 'jellyfin',
    description: 'Agent-first Jellyfin CLI',
    status,
    envMissingCode: 'JELLYFIN_ENV_MISSING',
    envNextAction,
    showCommandsAction,
    onReachable: (result) => ({ configured: true, version: result.version, serverName: result.serverName }),
  })

const limitCommand = <Result extends JellyfinCliResult>(
  { args, limitFromArgs, recover, wrap }: JellyfinInvocation,
  program: (limit: number) => Effect.Effect<Result, JellyfinError, JellyfinApi>
) => recover(limitFromArgs(args, limitFlag, defaultLimit).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const itemSearchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: JellyfinInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const query = parsed.positionals.join(' ').trim()
      if (Str.isEmpty(query)) {
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

const commandDefinitions: ReadonlyArray<CommandDefinition<JellyfinCliResult, JellyfinCliError, JellyfinCliContext>> = [
  {
    name: 'status',
    command: `${rootCommand} status`,
    description: 'Return Jellyfin server status',
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'users',
    command: `${rootCommand} users`,
    description: 'Return Jellyfin users',
    handle: ({ wrap }) => wrap(users),
  },
  {
    name: 'libraries',
    command: `${rootCommand} libraries`,
    description: 'Return Jellyfin libraries',
    handle: ({ wrap }) => wrap(libraries),
  },
  {
    name: 'sessions',
    command: `${rootCommand} sessions`,
    description: 'Return active sessions',
    handle: ({ wrap }) => wrap(sessions),
  },
  {
    name: 'now-playing',
    command: `${rootCommand} now-playing`,
    description: 'Return sessions with active playback',
    handle: ({ wrap }) => wrap(nowPlaying),
  },
  {
    name: 'recently-added',
    command: `${rootCommand} recently-added [${limitFlag} <n>]`,
    description: 'Return recently added items visible to JELLYFIN_USER_ID or the sole enabled administrator',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => recentlyAdded({ limit })),
  },
  {
    name: 'item-search',
    command: `${rootCommand} item-search <query> [${limitFlag} <n>]`,
    description: 'Search movies, series, and episodes visible to JELLYFIN_USER_ID or the sole enabled administrator',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: itemSearchCommand,
  },
  {
    name: 'library-stats',
    command: `${rootCommand} library-stats`,
    description: 'Return Jellyfin item counts',
    handle: ({ wrap }) => wrap(libraryStats),
  },
  {
    name: 'scheduled-tasks',
    command: `${rootCommand} scheduled-tasks`,
    description: 'Return scheduled tasks',
    handle: ({ wrap }) => wrap(scheduledTasks),
  },
  {
    name: 'run-task',
    command: `${rootCommand} run-task <task-id> [${confirmRunTaskFlag}]`,
    description: 'Start a scheduled task',
    flags: [{ name: confirmRunTaskFlag, description: 'Confirm scheduled task start' }],
    handle: runTaskCommand,
  },
]

const execute = createCliRunner<JellyfinCliResult, JellyfinCliError, JellyfinCliContext>({
  rootCommand,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: nextActionsFor,
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeJellyfin = (
  args: ReadonlyArray<string>
): Effect.Effect<JellyfinCliEnvelope, never, JellyfinCliContext> => execute(args)
