import {
  bookInfo,
  books,
  catalog,
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

export type AutocaliwebCliResult =
  | RootResult
  | StatusResult
  | StatsResult
  | ListResult<CatalogEntry>
  | ListResult<BookRecord>
  | BookInfoRecord
  | SearchResult

export type AutocaliwebCliEnvelope = SuccessEnvelope<AutocaliwebCliResult> | ErrorEnvelope
type AutocaliwebCliError = AutocaliwebError | CliUsageError
type AutocaliwebCliContext = AutocaliwebApi | AutocaliwebConfig
type AutocaliwebInvocation = CommandInvocation<AutocaliwebCliResult, AutocaliwebCliError, AutocaliwebCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, AutocaliwebCliContext> =>
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

const limitCommand = <Result extends AutocaliwebCliResult>(
  { args, limitFromArgs, recover, wrap }: AutocaliwebInvocation,
  program: (limit: number) => Effect.Effect<Result, AutocaliwebError, AutocaliwebCliContext>
) => recover(limitFromArgs(args, limitFlag, defaultLimit).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const searchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: AutocaliwebInvocation) =>
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

const bookInfoCommand = ({ args, parseFlags, recover, usageError, wrap }: AutocaliwebInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args)
      const [uuid] = parsed.positionals
      if (uuid === undefined) {
        return yield* wrap(Effect.fail(usageError('book uuid is required')))
      }
      return yield* wrap(bookInfo({ uuid }))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<
  CommandDefinition<AutocaliwebCliResult, AutocaliwebCliError, AutocaliwebCliContext>
> = [
  {
    name: 'status',
    description: { command: `${rootCommand} status`, description: 'Return Autocaliweb OPDS status and catalog stats' },
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'version',
    description: { command: `${rootCommand} version`, description: 'Alias for status' },
    handle: ({ wrap }) => wrap(version),
  },
  {
    name: 'stats',
    description: { command: `${rootCommand} stats`, description: 'Return Autocaliweb database counts' },
    handle: ({ wrap }) => wrap(stats),
  },
  {
    name: 'catalog',
    description: { command: `${rootCommand} catalog`, description: 'Return top-level OPDS catalog entries' },
    handle: ({ wrap }) => wrap(catalog),
  },
  {
    name: 'books',
    description: {
      command: `${rootCommand} books [${limitFlag} <n>]`,
      description: 'Return a bounded alphabetical book list',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
    },
    handle: (invocation) => limitCommand(invocation, (limit) => books({ limit })),
  },
  {
    name: 'recent',
    description: {
      command: `${rootCommand} recent [${limitFlag} <n>]`,
      description: 'Return recently added books',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
    },
    handle: (invocation) => limitCommand(invocation, (limit) => recent({ limit })),
  },
  {
    name: 'search',
    description: {
      command: `${rootCommand} search <query> [${limitFlag} <n>]`,
      description: 'Search books through OPDS',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
    },
    handle: searchCommand,
  },
  {
    name: 'book-info',
    description: {
      command: `${rootCommand} book-info <uuid>`,
      description: 'Return Calibre Companion metadata for a book UUID',
    },
    handle: bookInfoCommand,
  },
  {
    name: 'shelves',
    description: {
      command: `${rootCommand} shelves`,
      description: 'Return OPDS shelves visible to the logged-in user',
    },
    handle: ({ wrap }) => wrap(shelves),
  },
]

const execute = createCliRunner<AutocaliwebCliResult, AutocaliwebCliError, AutocaliwebCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeAutocaliweb = (
  args: ReadonlyArray<string>
): Effect.Effect<AutocaliwebCliEnvelope, never, AutocaliwebCliContext> => execute(args)
