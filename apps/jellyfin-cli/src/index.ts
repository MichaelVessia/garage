import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  cliUsageError,
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

import {
  commandTree,
  confirmRunTaskFlag,
  envNextAction,
  limitFlag,
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

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (
  command: string,
  error: JellyfinError,
  nextActions: ReadonlyArray<NextAction>
): ErrorEnvelope =>
  errorEnvelope({ command, error: { code: error.code, message: error.message }, fix: error.fix, nextActions })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, JellyfinError, JellyfinApi | JellyfinConfig>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, JellyfinApi | JellyfinConfig> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]), onSuccess: (x) => x })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, JellyfinError> => {
  if (value === undefined) {
    return Effect.fail(cliUsageError(`${label} is required`))
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0
    ? Effect.succeed(parsed)
    : Effect.fail(cliUsageError(`${label} must be a positive integer`))
}

const parseFlags = (
  tokens: ReadonlyArray<string>,
  valueFlags: ReadonlyArray<string>,
  booleanFlags: ReadonlyArray<string>
): Effect.Effect<ParsedFlags, JellyfinError> => {
  const positionals: Array<string> = []
  const values = new Map<string, string>()
  const booleans = new Set<string>()
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === undefined) {
      index += 1
    } else if (valueFlags.includes(token)) {
      const value = tokens[index + 1]
      if (value === undefined || value.startsWith('-')) {
        return Effect.fail(cliUsageError(`${token} requires a value`))
      }
      values.set(token, value)
      index += 2
    } else if (booleanFlags.includes(token)) {
      booleans.add(token)
      index += 1
    } else if (token.startsWith('-')) {
      return Effect.fail(cliUsageError(`Unknown flag ${token}`))
    } else {
      positionals.push(token)
      index += 1
    }
  }
  return Effect.succeed({ positionals, values, booleans })
}

const recoverEnvelope = (
  command: string,
  program: Effect.Effect<JellyfinCliEnvelope, JellyfinError, JellyfinApi | JellyfinConfig>
): Effect.Effect<JellyfinCliEnvelope, never, JellyfinApi | JellyfinConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, JellyfinApi | JellyfinConfig> =>
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

const limitFromArgs = (args: ReadonlyArray<string>) =>
  parseFlags(args, [limitFlag], []).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(limitFlag)
      return value === undefined ? Effect.succeed(defaultLimit) : parseInteger(value, 'limit')
    })
  )

const limitCommand = <Result extends JellyfinCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  program: (limit: number) => Effect.Effect<Result, JellyfinError, JellyfinApi | JellyfinConfig>
) => recoverEnvelope(command, limitFromArgs(args).pipe(Effect.flatMap((limit) => wrap(command, program(limit)))))

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<JellyfinCliEnvelope, never, JellyfinApi | JellyfinConfig> => {
  const command = commandString(args)
  const [name] = args
  const rest = args.slice(1)
  switch (name) {
    case undefined: {
      return root(command)
    }
    case 'status': {
      return wrap(command, status)
    }
    case 'users': {
      return wrap(command, users)
    }
    case 'libraries': {
      return wrap(command, libraries)
    }
    case 'sessions': {
      return wrap(command, sessions)
    }
    case 'now-playing': {
      return wrap(command, nowPlaying)
    }
    case 'recently-added': {
      return limitCommand(command, rest, (limit) => recentlyAdded({ limit }))
    }
    case 'item-search': {
      return recoverEnvelope(
        command,
        Effect.gen(function* () {
          const parsed = yield* parseFlags(rest, [limitFlag], [])
          const query = parsed.positionals.join(' ').trim()
          if (query.length === 0) {
            return yield* wrap(command, Effect.fail(cliUsageError('query is required')))
          }
          const value = parsed.values.get(limitFlag)
          const limit = value === undefined ? defaultLimit : yield* parseInteger(value, 'limit')
          return yield* wrap(command, itemSearch({ query, limit }))
        })
      )
    }
    case 'library-stats': {
      return wrap(command, libraryStats)
    }
    case 'scheduled-tasks': {
      return wrap(command, scheduledTasks)
    }
    case 'run-task': {
      return recoverEnvelope(
        command,
        Effect.gen(function* () {
          const parsed = yield* parseFlags(rest, [], [confirmRunTaskFlag])
          const [taskId] = parsed.positionals
          if (taskId === undefined) {
            return yield* wrap(command, Effect.fail(cliUsageError('task-id is required')))
          }
          if (!parsed.booleans.has(confirmRunTaskFlag)) {
            return errorToEnvelope(command, confirmationRequired(), [
              {
                command: `${rootCommand} run-task <task-id> --confirm-run-task`,
                description: 'Run the scheduled task after user confirmation',
                params: { 'task-id': { value: taskId, description: 'Jellyfin scheduled task ID' } },
              },
            ])
          }
          return yield* wrap(command, runTask(taskId))
        })
      )
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeJellyfin = (
  args: ReadonlyArray<string>
): Effect.Effect<JellyfinCliEnvelope, never, JellyfinApi | JellyfinConfig> => dispatch(args)
