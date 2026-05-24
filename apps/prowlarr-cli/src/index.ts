import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  applications,
  cliUsageError,
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
  ProwlarrConfig,
  ProwlarrError,
  SearchProtocol,
  SearchResult,
  SystemStatus,
} from '@garage/prowlarr'
import { Effect } from 'effect'

import {
  appsCommandTemplate,
  categoryFlag,
  categoryShortFlag,
  commandTree,
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

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (
  command: string,
  error: ProwlarrError,
  nextActions: ReadonlyArray<NextAction>
): ErrorEnvelope =>
  errorEnvelope({
    command,
    error: { code: error.code, message: error.message },
    fix: error.fix,
    nextActions,
  })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, ProwlarrError, ProwlarrApi | ProwlarrConfig>,
  nextActions: (
    result: Result
  ) => Effect.Effect<ReadonlyArray<NextAction>, ProwlarrError, ProwlarrApi | ProwlarrConfig> = () => Effect.succeed([])
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, ProwlarrApi | ProwlarrConfig> =>
  program.pipe(
    Effect.flatMap((result) =>
      nextActions(result).pipe(Effect.map((actions) => successEnvelope({ command, result, nextActions: actions })))
    ),
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, ProwlarrError> => {
  if (value === undefined) {
    return Effect.fail(cliUsageError(`${label} is required`))
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return Effect.fail(cliUsageError(`${label} must be a positive integer`))
  }

  return Effect.succeed(parsed)
}

const parseFlags = (
  tokens: ReadonlyArray<string>,
  valueFlags: ReadonlyArray<string>,
  booleanFlags: ReadonlyArray<string>
): Effect.Effect<ParsedFlags, ProwlarrError> => {
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
  program: Effect.Effect<ProwlarrCliEnvelope, ProwlarrError, ProwlarrApi | ProwlarrConfig>
): Effect.Effect<ProwlarrCliEnvelope, never, ProwlarrApi | ProwlarrConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, ProwlarrApi | ProwlarrConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) => {
        const rootHealth =
          error.code === 'PROWLARR_ENV_MISSING'
            ? { configured: false }
            : { configured: true, reachable: false, errorCode: error.code }

        return successEnvelope({
          command,
          result: {
            name: 'prowlarr',
            description: 'Agent-first Prowlarr CLI',
            commands: commandTree,
            health: rootHealth,
          },
          nextActions: error.code === 'PROWLARR_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        })
      },
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'prowlarr',
            description: 'Agent-first Prowlarr CLI',
            commands: commandTree,
            health: { configured: true, appName: result.appName ?? 'Prowlarr', version: result.version },
          },
        }),
    })
  )

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
  positionalAllowed: boolean
): Effect.Effect<number, ProwlarrError> => {
  const value = parsed.values.get(limitFlag)
  if (value !== undefined) {
    return parseInteger(value, 'limit')
  }

  const [positional] = parsed.positionals
  if (positionalAllowed && positional !== undefined) {
    return parseInteger(positional, 'limit')
  }

  return Effect.succeed(defaultValue)
}

const limitCommand = <Result extends ProwlarrCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  defaultValue: number,
  description: string,
  template: string,
  program: (limit: number) => Effect.Effect<Result, ProwlarrError, ProwlarrApi | ProwlarrConfig>,
  positionalAllowed = false
) =>
  recoverEnvelope(
    command,
    parseFlags(args, [limitFlag], []).pipe(
      Effect.flatMap((parsed) => limitFromParsed(parsed, defaultValue, positionalAllowed)),
      Effect.flatMap((limit) =>
        wrap(command, program(limit), () => Effect.succeed(listNextAction(template, description, defaultValue)))
      )
    )
  )

const statusCommand = (command: string) => wrap(command, status)

const healthCommand = (command: string, args: ReadonlyArray<string>) =>
  limitCommand(command, args, defaultLimit, 'Return more health records', healthCommandTemplate, (limit) =>
    health({ limit })
  )

const indexersCommand = (command: string, args: ReadonlyArray<string>) =>
  limitCommand(command, args, defaultLimit, 'Return more indexers', indexersCommandTemplate, (limit) =>
    indexers({ limit })
  )

const indexerStatsCommand = (command: string, args: ReadonlyArray<string>) =>
  limitCommand(command, args, defaultLimit, 'Return more indexer stats', indexerStatsCommandTemplate, (limit) =>
    indexerStats({ limit })
  )

const searchProtocol = (parsed: ParsedFlags): Effect.Effect<ReadonlyArray<SearchProtocol>, ProwlarrError> => {
  const torrents = parsed.booleans.has(torrentsFlag)
  const usenet = parsed.booleans.has(usenetFlag)

  if (torrents && usenet) {
    return Effect.fail(cliUsageError('Use only one of --torrents or --usenet'))
  }

  if (torrents) {
    return Effect.succeed(['torrent'])
  }

  return Effect.succeed(usenet ? ['usenet'] : [])
}

const searchCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(
        args,
        [limitFlag, categoryFlag, categoryShortFlag, typeFlag],
        [torrentsFlag, usenetFlag]
      )
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(command, Effect.fail(cliUsageError('search query is required')))
      }

      const limit = yield* limitFromParsed(parsed, defaultLimit, false)
      const categoryValue = parsed.values.get(categoryFlag) ?? parsed.values.get(categoryShortFlag)
      const category = categoryValue === undefined ? undefined : yield* parseInteger(categoryValue, 'category')
      const [protocol] = yield* searchProtocol(parsed)
      const type = parsed.values.get(typeFlag)

      return yield* wrap(
        command,
        search(query, {
          limit,
          ...(protocol === undefined ? {} : { protocol }),
          ...(category === undefined ? {} : { category }),
          ...(type === undefined ? {} : { type }),
        })
      )
    })
  )

const tvSearchCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(
        args,
        [tvdbFlag, seasonFlag, seasonShortFlag, episodeFlag, episodeShortFlag, limitFlag],
        []
      )
      const limit = yield* limitFromParsed(parsed, defaultLimit, false)
      const tvdbId = yield* parseInteger(parsed.values.get(tvdbFlag), 'tvdb-id')
      const seasonValue = parsed.values.get(seasonFlag) ?? parsed.values.get(seasonShortFlag)
      const episodeValue = parsed.values.get(episodeFlag) ?? parsed.values.get(episodeShortFlag)
      const season = seasonValue === undefined ? undefined : yield* parseInteger(seasonValue, 'season')
      const episode = episodeValue === undefined ? undefined : yield* parseInteger(episodeValue, 'episode')

      return yield* wrap(
        command,
        tvSearch({
          tvdbId,
          limit,
          ...(season === undefined ? {} : { season }),
          ...(episode === undefined ? {} : { episode }),
        })
      )
    })
  )

const movieSearchCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [imdbFlag, tmdbFlag, limitFlag], [])
      const limit = yield* limitFromParsed(parsed, defaultLimit, false)
      const imdbId = parsed.values.get(imdbFlag)
      const tmdbValue = parsed.values.get(tmdbFlag)
      const tmdbId = tmdbValue === undefined ? undefined : yield* parseInteger(tmdbValue, 'tmdb-id')

      if (imdbId === undefined && tmdbId === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('movie-search requires --imdb or --tmdb')))
      }

      return yield* wrap(
        command,
        movieSearch({
          limit,
          ...(imdbId === undefined ? {} : { imdbId }),
          ...(tmdbId === undefined ? {} : { tmdbId }),
        })
      )
    })
  )

const testCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    parseInteger(args[0], 'indexer-id').pipe(Effect.flatMap((indexerId) => wrap(command, testIndexer(indexerId))))
  )

const appsCommand = (command: string, args: ReadonlyArray<string>) =>
  limitCommand(command, args, defaultLimit, 'Return more connected applications', appsCommandTemplate, (limit) =>
    applications({ limit })
  )

const syncConfirmationEnvelope = (command: string): ErrorEnvelope =>
  errorToEnvelope(command, syncConfirmationRequired(), [
    {
      command: syncConfirmedCommandTemplate,
      description: 'Push Prowlarr indexer config to all connected apps',
    },
  ])

const syncCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [], [confirmSyncFlag])

      if (!parsed.booleans.has(confirmSyncFlag)) {
        return syncConfirmationEnvelope(command)
      }

      return yield* wrap(command, sync)
    })
  )

const historyCommand = (command: string, args: ReadonlyArray<string>) =>
  limitCommand(
    command,
    args,
    defaultHistoryLimit,
    'Return more history records',
    historyLimitCommandTemplate,
    (limit) => history({ limit }),
    true
  )

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<ProwlarrCliEnvelope, never, ProwlarrApi | ProwlarrConfig> => {
  const command = commandString(args)
  const [name] = args
  const rest = args.slice(1)

  switch (name) {
    case undefined: {
      return root(command)
    }
    case 'status': {
      return statusCommand(command)
    }
    case 'health': {
      return healthCommand(command, rest)
    }
    case 'indexers': {
      return indexersCommand(command, rest)
    }
    case 'indexer-stats':
    case 'stats': {
      return indexerStatsCommand(command, rest)
    }
    case 'search': {
      return searchCommand(command, rest)
    }
    case 'tv-search': {
      return tvSearchCommand(command, rest)
    }
    case 'movie-search': {
      return movieSearchCommand(command, rest)
    }
    case 'test': {
      return testCommand(command, rest)
    }
    case 'apps':
    case 'applications': {
      return appsCommand(command, rest)
    }
    case 'sync': {
      return syncCommand(command, rest)
    }
    case 'history': {
      return historyCommand(command, rest)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeProwlarr = (
  args: ReadonlyArray<string>
): Effect.Effect<ProwlarrCliEnvelope, never, ProwlarrApi | ProwlarrConfig> => dispatch(args)
