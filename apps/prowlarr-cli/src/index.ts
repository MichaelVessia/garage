import { createCliRunner, createCliUsageError, makeRoot } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  NextAction,
  ParsedFlags,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  applications,
  defaultHistoryLimit,
  defaultLimit,
  health,
  history,
  indexerStats,
  indexers,
  movieSearch,
  search,
  status,
  sync,
  syncConfirmationRequired,
  testIndexer,
  tvSearch,
} from '@garage/prowlarr'
import type {
  ApplicationRecord,
  CommandResult,
  HealthRecord,
  HistoryRecord,
  IndexerRecord,
  IndexerStatsRecord,
  IndexerTestResult,
  ListResult,
  ProwlarrApi,
  ProwlarrError,
  SearchProtocol,
  SearchResult,
  SystemStatus,
} from '@garage/prowlarr'
import * as Effect from 'effect/Effect'
import * as Str from 'effect/String'

import {
  appsCommandTemplate,
  categoryFlag,
  categoryShortFlag,
  confirmSyncFlag,
  envNextAction,
  episodeFlag,
  episodeShortFlag,
  healthCommandTemplate,
  historyLimitCommandTemplate,
  imdbFlag,
  indexerStatsCommandTemplate,
  indexersCommandTemplate,
  limitFlag,
  rootCommand,
  seasonFlag,
  seasonShortFlag,
  showCommandsAction,
  statusCommandTemplate,
  syncConfirmedCommandTemplate,
  tmdbFlag,
  torrentsFlag,
  tvdbFlag,
  typeFlag,
  usenetFlag,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type ProwlarrCliResult =
  | RootResult
  | SystemStatus
  | ListResult<HealthRecord>
  | ListResult<IndexerRecord>
  | ListResult<IndexerStatsRecord>
  | SearchResult
  | IndexerTestResult
  | ListResult<ApplicationRecord>
  | CommandResult
  | ListResult<HistoryRecord>

export type ProwlarrCliEnvelope = SuccessEnvelope<ProwlarrCliResult> | ErrorEnvelope
type ProwlarrCliError = ProwlarrError | CliUsageError
type ProwlarrCliContext = ProwlarrApi
type ProwlarrInvocation = CommandInvocation<ProwlarrCliResult, ProwlarrCliError, ProwlarrCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, ProwlarrCliContext> =>
  makeRoot({
    command,
    commandTree,
    name: 'prowlarr',
    description: 'Agent-first Prowlarr CLI',
    status,
    envMissingCode: 'PROWLARR_ENV_MISSING',
    envNextAction,
    showCommandsAction,
    onReachable: (result) => ({ configured: true, appName: result.appName ?? 'Prowlarr', version: result.version }),
  })

const listNextAction = (
  command: string,
  description: string,
  defaultLimitValue = defaultLimit
): ReadonlyArray<NextAction> => [
  {
    command,
    description,
    params: { limit: { default: defaultLimitValue, description: 'Maximum records to return' } },
  },
]

const limitFromParsed = (
  parsed: ParsedFlags,
  defaultValue: number,
  positionalAllowed: boolean,
  parsePositiveInteger: ProwlarrInvocation['parsePositiveInteger']
): Effect.Effect<number, ProwlarrCliError> => {
  const value = parsed.values.get(limitFlag)
  if (value !== undefined) {
    return parsePositiveInteger(value, 'limit')
  }

  const [positional] = parsed.positionals
  if (positionalAllowed && positional !== undefined) {
    return parsePositiveInteger(positional, 'limit')
  }

  return Effect.succeed(defaultValue)
}

const limitCommand = <Result extends ProwlarrCliResult>(
  { args, parseFlags, parsePositiveInteger, recover, wrap }: ProwlarrInvocation,
  defaultValue: number,
  description: string,
  template: string,
  program: (limit: number) => Effect.Effect<Result, ProwlarrError, ProwlarrApi>,
  positionalAllowed = false
) =>
  recover(
    parseFlags(args, { valueFlags: [limitFlag] }).pipe(
      Effect.flatMap((parsed) => limitFromParsed(parsed, defaultValue, positionalAllowed, parsePositiveInteger)),
      Effect.flatMap((limit) =>
        wrap(program(limit), () => Effect.succeed(listNextAction(template, description, defaultValue)))
      )
    )
  )

const healthCommand = (invocation: ProwlarrInvocation) =>
  limitCommand(invocation, defaultLimit, 'Return more health records', healthCommandTemplate, (limit) =>
    health({ limit })
  )

const indexersCommand = (invocation: ProwlarrInvocation) =>
  limitCommand(invocation, defaultLimit, 'Return more indexers', indexersCommandTemplate, (limit) =>
    indexers({ limit })
  )

const indexerStatsCommand = (invocation: ProwlarrInvocation) =>
  limitCommand(invocation, defaultLimit, 'Return more indexer stats', indexerStatsCommandTemplate, (limit) =>
    indexerStats({ limit })
  )

const searchProtocol = (
  parsed: ParsedFlags,
  usageError: ProwlarrInvocation['usageError']
): Effect.Effect<ReadonlyArray<SearchProtocol>, ProwlarrCliError> => {
  const torrents = parsed.booleans.has(torrentsFlag)
  const usenet = parsed.booleans.has(usenetFlag)

  if (torrents && usenet) {
    return Effect.fail(usageError('Use only one of --torrents or --usenet'))
  }

  if (torrents) {
    return Effect.succeed(['torrent'])
  }

  return Effect.succeed(usenet ? ['usenet'] : [])
}

const searchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: ProwlarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, {
        valueFlags: [limitFlag, categoryFlag, categoryShortFlag, typeFlag],
        booleanFlags: [torrentsFlag, usenetFlag],
      })
      const query = parsed.positionals.join(' ').trim()
      if (Str.isEmpty(query)) {
        return yield* wrap(Effect.fail(usageError('search query is required')))
      }

      const limit = yield* limitFromParsed(parsed, defaultLimit, false, parsePositiveInteger)
      const categoryValue = parsed.values.get(categoryFlag) ?? parsed.values.get(categoryShortFlag)
      const category = categoryValue === undefined ? undefined : yield* parsePositiveInteger(categoryValue, 'category')
      const [protocol] = yield* searchProtocol(parsed, usageError)
      const type = parsed.values.get(typeFlag)

      return yield* wrap(
        search(query, {
          limit,
          ...(protocol === undefined ? {} : { protocol }),
          ...(category === undefined ? {} : { category }),
          ...(type === undefined ? {} : { type }),
        })
      )
    })
  )

const tvSearchCommand = ({ args, parseFlags, parsePositiveInteger, recover, wrap }: ProwlarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, {
        valueFlags: [tvdbFlag, seasonFlag, seasonShortFlag, episodeFlag, episodeShortFlag, limitFlag],
      })
      const limit = yield* limitFromParsed(parsed, defaultLimit, false, parsePositiveInteger)
      const tvdbId = yield* parsePositiveInteger(parsed.values.get(tvdbFlag), 'tvdb-id')
      const seasonValue = parsed.values.get(seasonFlag) ?? parsed.values.get(seasonShortFlag)
      const episodeValue = parsed.values.get(episodeFlag) ?? parsed.values.get(episodeShortFlag)
      const season = seasonValue === undefined ? undefined : yield* parsePositiveInteger(seasonValue, 'season')
      const episode = episodeValue === undefined ? undefined : yield* parsePositiveInteger(episodeValue, 'episode')

      return yield* wrap(
        tvSearch({
          tvdbId,
          limit,
          ...(season === undefined ? {} : { season }),
          ...(episode === undefined ? {} : { episode }),
        })
      )
    })
  )

const movieSearchCommand = ({
  args,
  parseFlags,
  parsePositiveInteger,
  recover,
  usageError,
  wrap,
}: ProwlarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [imdbFlag, tmdbFlag, limitFlag] })
      const limit = yield* limitFromParsed(parsed, defaultLimit, false, parsePositiveInteger)
      const imdbId = parsed.values.get(imdbFlag)
      const tmdbValue = parsed.values.get(tmdbFlag)
      const tmdbId = tmdbValue === undefined ? undefined : yield* parsePositiveInteger(tmdbValue, 'tmdb-id')

      if (imdbId === undefined && tmdbId === undefined) {
        return yield* wrap(Effect.fail(usageError('movie-search requires --imdb or --tmdb')))
      }

      return yield* wrap(
        movieSearch({
          limit,
          ...(imdbId === undefined ? {} : { imdbId }),
          ...(tmdbId === undefined ? {} : { tmdbId }),
        })
      )
    })
  )

const testCommand = ({ args, parsePositiveInteger, recover, wrap }: ProwlarrInvocation) =>
  recover(parsePositiveInteger(args[0], 'indexer-id').pipe(Effect.flatMap((indexerId) => wrap(testIndexer(indexerId)))))

const appsCommand = (invocation: ProwlarrInvocation) =>
  limitCommand(invocation, defaultLimit, 'Return more connected applications', appsCommandTemplate, (limit) =>
    applications({ limit })
  )

const syncCommand = ({ args, errorToEnvelope, parseFlags, recover, wrap }: ProwlarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [confirmSyncFlag] })

      if (!parsed.booleans.has(confirmSyncFlag)) {
        return errorToEnvelope(syncConfirmationRequired(), [
          {
            command: syncConfirmedCommandTemplate,
            description: 'Push Prowlarr indexer config to all connected apps',
          },
        ])
      }

      return yield* wrap(sync)
    })
  )

const historyCommand = (invocation: ProwlarrInvocation) =>
  limitCommand(
    invocation,
    defaultHistoryLimit,
    'Return more history records',
    historyLimitCommandTemplate,
    (limit) => history({ limit }),
    true
  )

const commandDefinitions: ReadonlyArray<CommandDefinition<ProwlarrCliResult, ProwlarrCliError, ProwlarrCliContext>> = [
  {
    name: 'status',
    command: statusCommandTemplate,
    description: 'Return the Prowlarr system status summary',
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'health',
    command: healthCommandTemplate,
    description: 'Return active Prowlarr health warnings',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: healthCommand,
  },
  {
    name: 'indexers',
    command: indexersCommandTemplate,
    description: 'Return configured indexers',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: indexersCommand,
  },
  {
    name: 'indexer-stats',
    command: indexerStatsCommandTemplate,
    description: 'Return per-indexer query, grab, and failure counts',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: indexerStatsCommand,
  },
  {
    name: 'stats',
    command: indexerStatsCommandTemplate,
    description: 'Alias for indexer-stats',
    hidden: true,
    handle: indexerStatsCommand,
  },
  {
    name: 'search',
    command: `${rootCommand} search <query>`,
    description: 'Search enabled indexers by free text',
    flags: [
      { name: torrentsFlag, description: 'Search torrent indexers only' },
      { name: usenetFlag, description: 'Search usenet indexers only' },
      { name: `${categoryFlag} <id>`, description: 'Restrict by Newznab category ID' },
      { name: `${typeFlag} <type>`, description: 'Override Prowlarr search type', default: 'search' },
      { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
    ],
    handle: searchCommand,
  },
  {
    name: 'tv-search',
    command: `${rootCommand} tv-search --tvdb <id> [--season <n>] [--episode <n>]`,
    description: 'Search TV releases by TVDB ID',
    flags: [
      { name: `${tvdbFlag} <id>`, description: 'TVDB series ID' },
      { name: `${seasonFlag} <n>`, description: 'Season number' },
      { name: `${episodeFlag} <n>`, description: 'Episode number' },
      { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
    ],
    handle: tvSearchCommand,
  },
  {
    name: 'movie-search',
    command: `${rootCommand} movie-search --imdb <id> | --tmdb <id>`,
    description: 'Search movie releases by IMDB or TMDB ID',
    flags: [
      { name: `${imdbFlag} <id>`, description: 'IMDB title ID' },
      { name: `${tmdbFlag} <id>`, description: 'TMDB movie ID' },
      { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
    ],
    handle: movieSearchCommand,
  },
  {
    name: 'test',
    command: `${rootCommand} test <indexer-id>`,
    description: 'Test one indexer configuration',
    handle: testCommand,
  },
  {
    name: 'apps',
    command: appsCommandTemplate,
    description: 'Return connected applications',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: appsCommand,
  },
  {
    name: 'applications',
    command: appsCommandTemplate,
    description: 'Alias for apps',
    hidden: true,
    handle: appsCommand,
  },
  {
    name: 'sync',
    command: `${rootCommand} sync [${confirmSyncFlag}]`,
    description: 'Push indexer config to all connected applications',
    flags: [{ name: confirmSyncFlag, description: 'Confirm application indexer sync' }],
    handle: syncCommand,
  },
  {
    name: 'history',
    command: `${rootCommand} history [${limitFlag} <n>]`,
    description: 'Return recent indexer history',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultHistoryLimit }],
    handle: historyCommand,
  },
]

const execute = createCliRunner<ProwlarrCliResult, ProwlarrCliError, ProwlarrCliContext>({
  rootCommand,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeProwlarr = (
  args: ReadonlyArray<string>
): Effect.Effect<ProwlarrCliEnvelope, never, ProwlarrCliContext> => execute(args)
