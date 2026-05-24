import {
  bookInfo,
  books,
  cliUsageError,
  defaultLimit,
  libraries,
  me,
  search,
  shelves,
  status,
  version,
} from '@garage/booklore'
import type {
  BookRecord,
  BookloreApi,
  BookloreConfig,
  BookloreError,
  CurrentUser,
  JsonObject,
  LibraryRecord,
  ListResult,
  SearchResult,
  VersionResult,
} from '@garage/booklore'
import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import { Effect } from 'effect'

import { commandTree, envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type BookloreCliResult =
  | RootResult
  | VersionResult
  | CurrentUser
  | ListResult<LibraryRecord>
  | ListResult<BookRecord>
  | BookRecord
  | SearchResult
  | ListResult<JsonObject>

export type BookloreCliEnvelope = SuccessEnvelope<BookloreCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (
  command: string,
  error: BookloreError,
  nextActions: ReadonlyArray<NextAction>
): ErrorEnvelope =>
  errorEnvelope({ command, error: { code: error.code, message: error.message }, fix: error.fix, nextActions })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, BookloreError, BookloreApi | BookloreConfig>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, BookloreApi | BookloreConfig> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]), onSuccess: (x) => x })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, BookloreError> => {
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
): Effect.Effect<ParsedFlags, BookloreError> => {
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
  program: Effect.Effect<BookloreCliEnvelope, BookloreError, BookloreApi | BookloreConfig>
): Effect.Effect<BookloreCliEnvelope, never, BookloreApi | BookloreConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, BookloreApi | BookloreConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'booklore',
            description: 'Agent-first BookLore CLI',
            commands: commandTree,
            health:
              error.code === 'BOOKLORE_ENV_MISSING'
                ? { configured: false }
                : { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: error.code === 'BOOKLORE_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        }),
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'booklore',
            description: 'Agent-first BookLore CLI',
            commands: commandTree,
            health: { configured: true, current: result.current, latest: result.latest },
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

const limitCommand = <Result extends BookloreCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  program: (limit: number) => Effect.Effect<Result, BookloreError, BookloreApi | BookloreConfig>
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
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('book id is required')))
      }
      return yield* wrap(command, bookInfo({ id }))
    })
  )

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<BookloreCliEnvelope, never, BookloreApi | BookloreConfig> => {
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
    case 'me': {
      return wrap(command, me)
    }
    case 'libraries': {
      return wrap(command, libraries)
    }
    case 'books': {
      return limitCommand(command, rest, (limit) => books({ limit }))
    }
    case 'book-info': {
      return bookInfoCommand(command, rest)
    }
    case 'search': {
      return searchCommand(command, rest)
    }
    case 'shelves': {
      return wrap(command, shelves)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeBooklore = (
  args: ReadonlyArray<string>
): Effect.Effect<BookloreCliEnvelope, never, BookloreApi | BookloreConfig> => dispatch(args)
