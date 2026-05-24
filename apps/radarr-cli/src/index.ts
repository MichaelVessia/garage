import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  RadarrConfig,
  addCollection,
  addMovie,
  calendar,
  cliUsageError,
  collectionConfirmationRequired,
  collectionInfo,
  config,
  defaultAddCollectionResultLimit,
  defaultCalendarDays,
  defaultLimit,
  deleteConfirmationRequired,
  exists,
  firstTmdbId,
  history,
  missing,
  queue,
  removeMovie,
  search,
  status,
} from '@garage/radarr'
import type {
  AddCollectionResult,
  AddMovieResult,
  CalendarResult,
  CollectionInfoResult,
  ConfigSummary,
  ExistsResult,
  HistoryRecord,
  ListResult,
  MovieReleaseRecord,
  QueueRecord,
  RadarrApi,
  RadarrError,
  RemoveMovieResult,
  SearchResult,
  SystemStatus,
} from '@garage/radarr'
import { Effect, Option } from 'effect'

import {
  addCollectionCommandTemplate,
  addCommandTemplate,
  calendarDaysCommandTemplate,
  commandTree,
  collectionInfoCommandTemplate,
  confirmAddCollectionFlag,
  confirmDeleteFilesFlag,
  daysFlag,
  deleteFilesFlag,
  envNextAction,
  existsCommandTemplate,
  historyLimitCommandTemplate,
  limitFlag,
  missingLimitCommandTemplate,
  noSearchFlag,
  qualityProfileFlag,
  queueLimitCommandTemplate,
  removeKeepFilesCommandTemplate,
  resultLimitFlag,
  rootCommand,
  showCommandsAction,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type RadarrCliResult =
  | RootResult
  | SystemStatus
  | ConfigSummary
  | SearchResult
  | ExistsResult
  | AddMovieResult
  | AddCollectionResult
  | CollectionInfoResult
  | RemoveMovieResult
  | ListResult<QueueRecord>
  | CalendarResult
  | ListResult<MovieReleaseRecord>
  | ListResult<HistoryRecord>

export type RadarrCliEnvelope = SuccessEnvelope<RadarrCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (command: string, error: RadarrError, nextActions: ReadonlyArray<NextAction>): ErrorEnvelope =>
  errorEnvelope({
    command,
    error: { code: error.code, message: error.message },
    fix: error.fix,
    nextActions,
  })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, RadarrError, RadarrApi | RadarrConfig>,
  nextActions: (
    result: Result
  ) => Effect.Effect<ReadonlyArray<NextAction>, RadarrError, RadarrApi | RadarrConfig> = () => Effect.succeed([])
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, RadarrApi | RadarrConfig> =>
  program.pipe(
    Effect.flatMap((result) =>
      nextActions(result).pipe(Effect.map((actions) => successEnvelope({ command, result, nextActions: actions })))
    ),
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, RadarrError> => {
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
): Effect.Effect<ParsedFlags, RadarrError> => {
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
      if (value === undefined || value.startsWith('--')) {
        return Effect.fail(cliUsageError(`${token} requires a value`))
      }
      values.set(token, value)
      index += 2
    } else if (booleanFlags.includes(token)) {
      booleans.add(token)
      index += 1
    } else if (token.startsWith('--')) {
      return Effect.fail(cliUsageError(`Unknown flag ${token}`))
    } else {
      positionals.push(token)
      index += 1
    }
  }

  return Effect.succeed({ positionals, values, booleans })
}

const defaultQualityProfileAction = (
  tmdbId: number,
  description = 'Add a selected movie to Radarr'
): Effect.Effect<NextAction, RadarrError, RadarrConfig> =>
  Effect.gen(function* () {
    const radarrConfig = yield* RadarrConfig
    const values = yield* radarrConfig.get

    return {
      command: addCommandTemplate,
      description,
      params: {
        'tmdb-id': { value: tmdbId, description: 'TMDB movie ID' },
        'quality-profile-id': { default: values.defaultQualityProfileId, description: 'Radarr quality profile ID' },
      },
    }
  })

const existsNextActions = (result: ExistsResult): Effect.Effect<ReadonlyArray<NextAction>, RadarrError, RadarrConfig> =>
  result.exists
    ? Effect.succeed([])
    : defaultQualityProfileAction(result.tmdbId, 'Add this TMDB movie to Radarr').pipe(Effect.map((action) => [action]))

const collectionNextActions = (collectionTmdbId: number): ReadonlyArray<NextAction> => [
  {
    command: collectionInfoCommandTemplate,
    description: 'Inspect the collection before adding it',
    params: { 'collection-tmdb-id': { value: collectionTmdbId, description: 'TMDB collection ID' } },
  },
  {
    command: addCollectionCommandTemplate,
    description: 'Add this collection after user confirmation',
    params: { 'collection-tmdb-id': { value: collectionTmdbId, description: 'TMDB collection ID' } },
  },
]

const searchNextActions = (result: SearchResult): Effect.Effect<ReadonlyArray<NextAction>, RadarrError, RadarrConfig> =>
  Option.match(firstTmdbId(result.results), {
    onNone: () => Effect.succeed([]),
    onSome: (tmdbId) =>
      defaultQualityProfileAction(tmdbId).pipe(
        Effect.map((addAction) => {
          const selected = result.results.find((movie) => movie.tmdbId === tmdbId)
          const collectionActions =
            selected?.collection === undefined ? [] : collectionNextActions(selected.collection.tmdbId)

          return [
            {
              command: existsCommandTemplate,
              description: 'Check whether a selected movie is already in the library',
              params: { 'tmdb-id': { value: tmdbId, description: 'TMDB movie ID' } },
            },
            addAction,
            ...collectionActions,
          ]
        })
      ),
  })

const listNextAction = (command: string, description: string): ReadonlyArray<NextAction> => [
  {
    command,
    description,
    params: { limit: { default: defaultLimit, description: 'Maximum records to return' } },
  },
]

const recoverEnvelope = (
  command: string,
  program: Effect.Effect<RadarrCliEnvelope, RadarrError, RadarrApi | RadarrConfig>
): Effect.Effect<RadarrCliEnvelope, never, RadarrApi | RadarrConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, RadarrApi | RadarrConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) => {
        const health =
          error.code === 'RADARR_ENV_MISSING'
            ? { configured: false }
            : { configured: true, reachable: false, errorCode: error.code }

        return successEnvelope({
          command,
          result: {
            name: 'radarr',
            description: 'Agent-first Radarr CLI',
            commands: commandTree,
            health,
          },
          nextActions: error.code === 'RADARR_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        })
      },
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'radarr',
            description: 'Agent-first Radarr CLI',
            commands: commandTree,
            health: { configured: true, appName: result.appName ?? 'Radarr', version: result.version },
          },
        }),
    })
  )

const statusCommand = (command: string) => wrap(command, status)
const configCommand = (command: string) => wrap(command, config)

const searchCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [limitFlag], [])
      const query = parsed.positionals.join(' ').trim()
      const limitValue = parsed.values.get(limitFlag)
      const limit = limitValue === undefined ? defaultLimit : yield* parseInteger(limitValue, limitFlag)

      if (query.length === 0) {
        return yield* wrap(command, Effect.fail(cliUsageError('search query is required')))
      }

      return yield* wrap(command, search(query, { limit }), searchNextActions)
    })
  )

const existsCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    parseInteger(args[0], 'tmdb-id').pipe(Effect.flatMap((tmdbId) => wrap(command, exists(tmdbId), existsNextActions)))
  )

const addCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [qualityProfileFlag], [noSearchFlag])
      const tmdbId = yield* parseInteger(parsed.positionals[0], 'tmdb-id')
      const qualityProfileValue = parsed.values.get(qualityProfileFlag)
      const qualityProfileId =
        qualityProfileValue === undefined ? undefined : yield* parseInteger(qualityProfileValue, 'quality-profile-id')
      const searchForMovie = !parsed.booleans.has(noSearchFlag)
      const options = qualityProfileId === undefined ? { searchForMovie } : { qualityProfileId, searchForMovie }

      return yield* wrap(command, addMovie(tmdbId, options))
    })
  )

const addCollectionConfirmationEnvelope = (command: string, collectionTmdbId: number): ErrorEnvelope =>
  errorToEnvelope(command, collectionConfirmationRequired(), collectionNextActions(collectionTmdbId))

const addCollectionCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [resultLimitFlag], [noSearchFlag, confirmAddCollectionFlag])
      const collectionTmdbId = yield* parseInteger(parsed.positionals[0], 'collection-tmdb-id')
      const resultLimitValue = parsed.values.get(resultLimitFlag)
      const resultLimit =
        resultLimitValue === undefined
          ? defaultAddCollectionResultLimit
          : yield* parseInteger(resultLimitValue, 'result-limit')

      if (!parsed.booleans.has(confirmAddCollectionFlag)) {
        return addCollectionConfirmationEnvelope(command, collectionTmdbId)
      }

      return yield* wrap(
        command,
        addCollection(collectionTmdbId, {
          searchForMovies: !parsed.booleans.has(noSearchFlag),
          resultLimit,
        })
      )
    })
  )

const collectionInfoCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    parseInteger(args[0], 'collection-tmdb-id').pipe(
      Effect.flatMap((collectionTmdbId) =>
        wrap(command, collectionInfo(collectionTmdbId), () =>
          Effect.succeed(collectionNextActions(collectionTmdbId).slice(1))
        )
      )
    )
  )

const removeDeleteConfirmationEnvelope = (command: string, tmdbId: number): ErrorEnvelope =>
  errorToEnvelope(command, deleteConfirmationRequired(), [
    {
      command: removeKeepFilesCommandTemplate,
      description: 'Remove the movie from Radarr while keeping files on disk',
      params: { 'tmdb-id': { value: tmdbId, description: 'TMDB movie ID' } },
    },
  ])

const removeCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [], [deleteFilesFlag, confirmDeleteFilesFlag])
      const tmdbId = yield* parseInteger(parsed.positionals[0], 'tmdb-id')
      const deleteFiles = parsed.booleans.has(deleteFilesFlag)

      if (deleteFiles && !parsed.booleans.has(confirmDeleteFilesFlag)) {
        return removeDeleteConfirmationEnvelope(command, tmdbId)
      }

      return yield* wrap(command, removeMovie(tmdbId, { deleteFiles }))
    })
  )

const limitFromArgs = (
  args: ReadonlyArray<string>,
  flagName: string,
  defaultValue: number
): Effect.Effect<number, RadarrError> =>
  parseFlags(args, [flagName], []).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(flagName)
      return value === undefined ? Effect.succeed(defaultValue) : parseInteger(value, flagName)
    })
  )

const queueCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(command, queue({ limit }), () =>
          Effect.succeed(listNextAction(queueLimitCommandTemplate, 'Return more active queue records'))
        )
      )
    )
  )

const calendarCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    limitFromArgs(args, daysFlag, defaultCalendarDays).pipe(
      Effect.flatMap((days) =>
        wrap(command, calendar({ days }), () =>
          Effect.succeed([
            {
              command: calendarDaysCommandTemplate,
              description: 'Change the upcoming movie day window',
              params: { days: { default: defaultCalendarDays, description: 'Number of days to include' } },
            },
          ])
        )
      )
    )
  )

const missingCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(command, missing({ limit }), () =>
          Effect.succeed(listNextAction(missingLimitCommandTemplate, 'Return more missing movie records'))
        )
      )
    )
  )

const historyCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(command, history({ limit }), () =>
          Effect.succeed(listNextAction(historyLimitCommandTemplate, 'Return more history records'))
        )
      )
    )
  )

const dispatch = (args: ReadonlyArray<string>): Effect.Effect<RadarrCliEnvelope, never, RadarrApi | RadarrConfig> => {
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
    case 'config': {
      return configCommand(command)
    }
    case 'search': {
      return searchCommand(command, rest)
    }
    case 'exists': {
      return existsCommand(command, rest)
    }
    case 'add': {
      return addCommand(command, rest)
    }
    case 'add-collection': {
      return addCollectionCommand(command, rest)
    }
    case 'collection-info': {
      return collectionInfoCommand(command, rest)
    }
    case 'remove': {
      return removeCommand(command, rest)
    }
    case 'queue': {
      return queueCommand(command, rest)
    }
    case 'calendar': {
      return calendarCommand(command, rest)
    }
    case 'missing': {
      return missingCommand(command, rest)
    }
    case 'history': {
      return historyCommand(command, rest)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeRadarr = (
  args: ReadonlyArray<string>
): Effect.Effect<RadarrCliEnvelope, never, RadarrApi | RadarrConfig> => dispatch(args)
