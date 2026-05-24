import { bookInfo, books, defaultLimit, libraries, me, search, shelves, status, version } from '@garage/booklore'
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
import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import { Effect } from 'effect'

import { envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
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
type BookloreCliError = BookloreError | CliUsageError
type BookloreCliContext = BookloreApi | BookloreConfig
type BookloreInvocation = CommandInvocation<BookloreCliResult, BookloreCliError, BookloreCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, BookloreCliContext> =>
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

const limitCommand = <Result extends BookloreCliResult>(
  { args, limitFromArgs, recover, wrap }: BookloreInvocation,
  program: (limit: number) => Effect.Effect<Result, BookloreError, BookloreCliContext>
) => recover(limitFromArgs(args, limitFlag, defaultLimit).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const searchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: BookloreInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(Effect.fail(usageError('query is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? defaultLimit : yield* parsePositiveInteger(value, 'limit')
      return yield* wrap(search({ query, limit }))
    })
  )

const bookInfoCommand = ({ args, parseFlags, recover, usageError, wrap }: BookloreInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args)
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(Effect.fail(usageError('book id is required')))
      }
      return yield* wrap(bookInfo({ id }))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<CommandDefinition<BookloreCliResult, BookloreCliError, BookloreCliContext>> = [
  {
    name: 'status',
    description: { command: `${rootCommand} status`, description: 'Return BookLore version status' },
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'version',
    description: { command: `${rootCommand} version`, description: 'Alias for status' },
    handle: ({ wrap }) => wrap(version),
  },
  {
    name: 'me',
    description: { command: `${rootCommand} me`, description: 'Return the logged-in BookLore user' },
    handle: ({ wrap }) => wrap(me),
  },
  {
    name: 'libraries',
    description: { command: `${rootCommand} libraries`, description: 'Return libraries and paths' },
    handle: ({ wrap }) => wrap(libraries),
  },
  {
    name: 'books',
    description: {
      command: `${rootCommand} books [${limitFlag} <n>]`,
      description: 'Return a bounded book list',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
    },
    handle: (invocation) => limitCommand(invocation, (limit) => books({ limit })),
  },
  {
    name: 'book-info',
    description: { command: `${rootCommand} book-info <id>`, description: 'Return a single book record' },
    handle: bookInfoCommand,
  },
  {
    name: 'search',
    description: {
      command: `${rootCommand} search <query> [${limitFlag} <n>]`,
      description: 'Client-side title search across books',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
    },
    handle: searchCommand,
  },
  {
    name: 'shelves',
    description: { command: `${rootCommand} shelves`, description: 'Return shelves visible to the logged-in user' },
    handle: ({ wrap }) => wrap(shelves),
  },
]

const execute = createCliRunner<BookloreCliResult, BookloreCliError, BookloreCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeBooklore = (
  args: ReadonlyArray<string>
): Effect.Effect<BookloreCliEnvelope, never, BookloreCliContext> => execute(args)
