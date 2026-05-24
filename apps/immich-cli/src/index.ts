import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  albumInfo,
  albums,
  cliUsageError,
  defaultLimit,
  jobs,
  libraryStats,
  me,
  people,
  personInfo,
  recent,
  search,
  stats,
  status,
  storage,
  tags,
  users,
} from '@garage/immich'
import type {
  AlbumInfo,
  AlbumSummary,
  CurrentUser,
  ImmichApi,
  ImmichConfig,
  ImmichError,
  JobRecord,
  ListResult,
  PeopleResult,
  PersonRecord,
  SearchResult,
  Statistics,
  StorageStatus,
  SystemStatus,
  TagRecord,
  UsersResult,
} from '@garage/immich'
import { Effect } from 'effect'

import { commandTree, envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type ImmichCliResult =
  | RootResult
  | SystemStatus
  | Statistics
  | StorageStatus
  | UsersResult
  | CurrentUser
  | ListResult<AlbumSummary>
  | AlbumInfo
  | SearchResult
  | PeopleResult
  | PersonRecord
  | ListResult<JobRecord>
  | ListResult<TagRecord>

export type ImmichCliEnvelope = SuccessEnvelope<ImmichCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (command: string, error: ImmichError, nextActions: ReadonlyArray<NextAction>): ErrorEnvelope =>
  errorEnvelope({ command, error: { code: error.code, message: error.message }, fix: error.fix, nextActions })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, ImmichError, ImmichApi | ImmichConfig>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, ImmichApi | ImmichConfig> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]), onSuccess: (x) => x })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, ImmichError> => {
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
  valueFlags: ReadonlyArray<string>
): Effect.Effect<ParsedFlags, ImmichError> => {
  const positionals: Array<string> = []
  const values = new Map<string, string>()
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
    } else if (token.startsWith('-')) {
      return Effect.fail(cliUsageError(`Unknown flag ${token}`))
    } else {
      positionals.push(token)
      index += 1
    }
  }
  return Effect.succeed({ positionals, values })
}

const recoverEnvelope = (
  command: string,
  program: Effect.Effect<ImmichCliEnvelope, ImmichError, ImmichApi | ImmichConfig>
): Effect.Effect<ImmichCliEnvelope, never, ImmichApi | ImmichConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, ImmichApi | ImmichConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'immich',
            description: 'Agent-first Immich CLI',
            commands: commandTree,
            health:
              error.code === 'IMMICH_ENV_MISSING'
                ? { configured: false }
                : { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: error.code === 'IMMICH_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        }),
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'immich',
            description: 'Agent-first Immich CLI',
            commands: commandTree,
            health: { configured: true, version: result.version, ping: result.ping },
          },
        }),
    })
  )

const limitFromArgs = (args: ReadonlyArray<string>) =>
  parseFlags(args, [limitFlag]).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(limitFlag)
      return value === undefined ? Effect.succeed(defaultLimit) : parseInteger(value, 'limit')
    })
  )

const limitCommand = <Result extends ImmichCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  program: (limit: number) => Effect.Effect<Result, ImmichError, ImmichApi | ImmichConfig>
) => recoverEnvelope(command, limitFromArgs(args).pipe(Effect.flatMap((limit) => wrap(command, program(limit)))))

const searchCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [limitFlag])
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(command, Effect.fail(cliUsageError('query is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? defaultLimit : yield* parseInteger(value, 'limit')
      return yield* wrap(command, search({ query, limit }))
    })
  )

const albumInfoCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [limitFlag])
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('album id is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? defaultLimit : yield* parseInteger(value, 'limit')
      return yield* wrap(command, albumInfo({ id, limit }))
    })
  )

const singleIdCommand = <Result extends ImmichCliResult>(
  command: string,
  rest: ReadonlyArray<string>,
  label: string,
  program: (id: string) => Effect.Effect<Result, ImmichError, ImmichApi | ImmichConfig>
) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [])
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError(`${label} is required`)))
      }
      return yield* wrap(command, program(id))
    })
  )

const dispatch = (args: ReadonlyArray<string>): Effect.Effect<ImmichCliEnvelope, never, ImmichApi | ImmichConfig> => {
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
    case 'stats': {
      return wrap(command, stats)
    }
    case 'storage': {
      return wrap(command, storage)
    }
    case 'users': {
      return wrap(command, users)
    }
    case 'me': {
      return wrap(command, me)
    }
    case 'albums': {
      return limitCommand(command, rest, (limit) => albums({ limit }))
    }
    case 'album-info': {
      return albumInfoCommand(command, rest)
    }
    case 'search': {
      return searchCommand(command, rest)
    }
    case 'recent': {
      return limitCommand(command, rest, (limit) => recent({ limit }))
    }
    case 'people': {
      return limitCommand(command, rest, (limit) => people({ limit }))
    }
    case 'person-info': {
      return singleIdCommand(command, rest, 'person id', personInfo)
    }
    case 'jobs': {
      return wrap(command, jobs)
    }
    case 'library-stats': {
      return wrap(command, libraryStats)
    }
    case 'tags': {
      return wrap(command, tags)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeImmich = (
  args: ReadonlyArray<string>
): Effect.Effect<ImmichCliEnvelope, never, ImmichApi | ImmichConfig> => dispatch(args)
