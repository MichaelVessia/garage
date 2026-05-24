import {
  bookInfo,
  books,
  catalog,
  cliUsageError,
  defaultLimit,
  recent,
  search,
  shelves,
  stats,
  status,
  version,
} from '@garage/autocaliweb'
import type {
  AutocaliwebApi,
  AutocaliwebConfig,
  AutocaliwebError,
  BookInfoRecord,
  BookRecord,
  CatalogEntry,
  ListResult,
  SearchResult,
  StatsResult,
  StatusResult,
} from '@garage/autocaliweb'
import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import { Effect } from 'effect'

import { commandTree, envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type AutocaliwebCliResult =
  | RootResult
  | StatusResult
  | StatsResult
  | ListResult<CatalogEntry>
  | ListResult<BookRecord>
  | BookInfoRecord
  | SearchResult

export type AutocaliwebCliEnvelope = SuccessEnvelope<AutocaliwebCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (
  command: string,
  error: AutocaliwebError,
  nextActions: ReadonlyArray<NextAction>
): ErrorEnvelope =>
  errorEnvelope({ command, error: { code: error.code, message: error.message }, fix: error.fix, nextActions })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, AutocaliwebApi | AutocaliwebConfig> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]), onSuccess: (x) => x })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, AutocaliwebError> => {
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
): Effect.Effect<ParsedFlags, AutocaliwebError> => {
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
  program: Effect.Effect<AutocaliwebCliEnvelope, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig>
): Effect.Effect<AutocaliwebCliEnvelope, never, AutocaliwebApi | AutocaliwebConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, AutocaliwebApi | AutocaliwebConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'autocaliweb',
            description: 'Agent-first Autocaliweb CLI',
            commands: commandTree,
            health:
              error.code === 'AUTOCALIWEB_ENV_MISSING'
                ? { configured: false }
                : { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: error.code === 'AUTOCALIWEB_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        }),
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'autocaliweb',
            description: 'Agent-first Autocaliweb CLI',
            commands: commandTree,
            health: { configured: true, title: result.title, books: result.stats.books },
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

const limitCommand = <Result extends AutocaliwebCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  program: (limit: number) => Effect.Effect<Result, AutocaliwebError, AutocaliwebApi | AutocaliwebConfig>
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

const bookInfoCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [])
      const [uuid] = parsed.positionals
      if (uuid === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('book uuid is required')))
      }
      return yield* wrap(command, bookInfo({ uuid }))
    })
  )

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<AutocaliwebCliEnvelope, never, AutocaliwebApi | AutocaliwebConfig> => {
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
    case 'version': {
      return wrap(command, version)
    }
    case 'stats': {
      return wrap(command, stats)
    }
    case 'catalog': {
      return wrap(command, catalog)
    }
    case 'books': {
      return limitCommand(command, rest, (limit) => books({ limit }))
    }
    case 'recent': {
      return limitCommand(command, rest, (limit) => recent({ limit }))
    }
    case 'search': {
      return searchCommand(command, rest)
    }
    case 'book-info': {
      return bookInfoCommand(command, rest)
    }
    case 'shelves': {
      return wrap(command, shelves)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeAutocaliweb = (
  args: ReadonlyArray<string>
): Effect.Effect<AutocaliwebCliEnvelope, never, AutocaliwebApi | AutocaliwebConfig> => dispatch(args)
