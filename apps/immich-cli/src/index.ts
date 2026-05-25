import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  albumInfo,
  albums,
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

import { envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
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
type ImmichCliError = ImmichError | CliUsageError
type ImmichCliContext = ImmichApi | ImmichConfig
type ImmichInvocation = CommandInvocation<ImmichCliResult, ImmichCliError, ImmichCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, ImmichCliContext> =>
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

const limitCommand = <Result extends ImmichCliResult>(
  { args, limitFromArgs, recover, wrap }: ImmichInvocation,
  program: (limit: number) => Effect.Effect<Result, ImmichError, ImmichApi | ImmichConfig>
) => recover(limitFromArgs(args, limitFlag, defaultLimit).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const searchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: ImmichInvocation) =>
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

const albumInfoCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: ImmichInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(Effect.fail(usageError('album id is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? defaultLimit : yield* parsePositiveInteger(value, 'limit')
      return yield* wrap(albumInfo({ id, limit }))
    })
  )

const singleIdCommand = <Result extends ImmichCliResult>(
  { args, parseFlags, recover, usageError, wrap }: ImmichInvocation,
  label: string,
  program: (id: string) => Effect.Effect<Result, ImmichError, ImmichApi | ImmichConfig>
) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args)
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(Effect.fail(usageError(`${label} is required`)))
      }
      return yield* wrap(program(id))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<CommandDefinition<ImmichCliResult, ImmichCliError, ImmichCliContext>> = [
  {
    name: 'status',
    command: `${rootCommand} status`,
    description: 'Return Immich version and ping',
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'stats',
    command: `${rootCommand} stats`,
    description: 'Return library photo, video, usage, and per-user stats',
    handle: ({ wrap }) => wrap(stats),
  },
  {
    name: 'storage',
    command: `${rootCommand} storage`,
    description: 'Return storage capacity and usage',
    handle: ({ wrap }) => wrap(storage),
  },
  {
    name: 'users',
    command: `${rootCommand} users`,
    description: 'Return users, preferring admin fields when available',
    handle: ({ wrap }) => wrap(users),
  },
  {
    name: 'me',
    command: `${rootCommand} me`,
    description: 'Return the user attached to the API key',
    handle: ({ wrap }) => wrap(me),
  },
  {
    name: 'albums',
    command: `${rootCommand} albums [${limitFlag} <n>]`,
    description: 'Return visible albums',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => albums({ limit })),
  },
  {
    name: 'album-info',
    command: `${rootCommand} album-info <id> [${limitFlag} <n>]`,
    description: 'Return album metadata and a bounded asset sample',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum assets to include', default: defaultLimit }],
    handle: albumInfoCommand,
  },
  {
    name: 'search',
    command: `${rootCommand} search <query> [${limitFlag} <n>]`,
    description: 'Run smart search, falling back to filename metadata search',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum assets to return', default: defaultLimit }],
    handle: searchCommand,
  },
  {
    name: 'recent',
    command: `${rootCommand} recent [${limitFlag} <n>]`,
    description: 'Return recent assets',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum assets to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => recent({ limit })),
  },
  {
    name: 'people',
    command: `${rootCommand} people [${limitFlag} <n>]`,
    description: 'Return visible people',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum people to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => people({ limit })),
  },
  {
    name: 'person-info',
    command: `${rootCommand} person-info <id>`,
    description: 'Return person detail',
    handle: (invocation) => singleIdCommand(invocation, 'person id', personInfo),
  },
  {
    name: 'jobs',
    command: `${rootCommand} jobs`,
    description: 'Return background job queues',
    handle: ({ wrap }) => wrap(jobs),
  },
  {
    name: 'library-stats',
    command: `${rootCommand} library-stats`,
    description: 'Alias for stats',
    handle: ({ wrap }) => wrap(libraryStats),
  },
  {
    name: 'tags',
    command: `${rootCommand} tags`,
    description: 'Return tags',
    handle: ({ wrap }) => wrap(tags),
  },
]

const execute = createCliRunner<ImmichCliResult, ImmichCliError, ImmichCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeImmich = (args: ReadonlyArray<string>): Effect.Effect<ImmichCliEnvelope, never, ImmichCliContext> =>
  execute(args)
