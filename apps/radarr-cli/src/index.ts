import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  NextAction,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  RadarrConfig,
  addCollection,
  addMovie,
  calendar,
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
type RadarrCliError = RadarrError | CliUsageError
type RadarrCliContext = RadarrApi | RadarrConfig
type RadarrInvocation = CommandInvocation<RadarrCliResult, RadarrCliError, RadarrCliContext>

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

const root = (
  command: string,
  commandTree: ReadonlyArray<{ readonly command: string; readonly description: string }>
): Effect.Effect<SuccessEnvelope<RootResult>, never, RadarrCliContext> =>
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

const searchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: RadarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const query = parsed.positionals.join(' ').trim()
      const limitValue = parsed.values.get(limitFlag)
      const limit = limitValue === undefined ? defaultLimit : yield* parsePositiveInteger(limitValue, limitFlag)

      if (query.length === 0) {
        return yield* wrap(Effect.fail(usageError('search query is required')))
      }

      return yield* wrap(search(query, { limit }), searchNextActions)
    })
  )

const existsCommand = ({ args, parsePositiveInteger, recover, wrap }: RadarrInvocation) =>
  recover(
    parsePositiveInteger(args[0], 'tmdb-id').pipe(Effect.flatMap((tmdbId) => wrap(exists(tmdbId), existsNextActions)))
  )

const addCommand = ({ args, parseFlags, parsePositiveInteger, recover, wrap }: RadarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [qualityProfileFlag], booleanFlags: [noSearchFlag] })
      const tmdbId = yield* parsePositiveInteger(parsed.positionals[0], 'tmdb-id')
      const qualityProfileValue = parsed.values.get(qualityProfileFlag)
      const qualityProfileId =
        qualityProfileValue === undefined
          ? undefined
          : yield* parsePositiveInteger(qualityProfileValue, 'quality-profile-id')
      const searchForMovie = !parsed.booleans.has(noSearchFlag)
      const options = qualityProfileId === undefined ? { searchForMovie } : { qualityProfileId, searchForMovie }

      return yield* wrap(addMovie(tmdbId, options))
    })
  )

const addCollectionCommand = ({
  args,
  errorToEnvelope,
  parseFlags,
  parsePositiveInteger,
  recover,
  wrap,
}: RadarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, {
        valueFlags: [resultLimitFlag],
        booleanFlags: [noSearchFlag, confirmAddCollectionFlag],
      })
      const collectionTmdbId = yield* parsePositiveInteger(parsed.positionals[0], 'collection-tmdb-id')
      const resultLimitValue = parsed.values.get(resultLimitFlag)
      const resultLimit =
        resultLimitValue === undefined
          ? defaultAddCollectionResultLimit
          : yield* parsePositiveInteger(resultLimitValue, 'result-limit')

      if (!parsed.booleans.has(confirmAddCollectionFlag)) {
        return errorToEnvelope(collectionConfirmationRequired(), collectionNextActions(collectionTmdbId))
      }

      return yield* wrap(
        addCollection(collectionTmdbId, {
          searchForMovies: !parsed.booleans.has(noSearchFlag),
          resultLimit,
        })
      )
    })
  )

const collectionInfoCommand = ({ args, parsePositiveInteger, recover, wrap }: RadarrInvocation) =>
  recover(
    parsePositiveInteger(args[0], 'collection-tmdb-id').pipe(
      Effect.flatMap((collectionTmdbId) =>
        wrap(collectionInfo(collectionTmdbId), () => Effect.succeed(collectionNextActions(collectionTmdbId).slice(1)))
      )
    )
  )

const removeCommand = ({ args, errorToEnvelope, parseFlags, parsePositiveInteger, recover, wrap }: RadarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [deleteFilesFlag, confirmDeleteFilesFlag] })
      const tmdbId = yield* parsePositiveInteger(parsed.positionals[0], 'tmdb-id')
      const deleteFiles = parsed.booleans.has(deleteFilesFlag)

      if (deleteFiles && !parsed.booleans.has(confirmDeleteFilesFlag)) {
        return errorToEnvelope(deleteConfirmationRequired(), [
          {
            command: removeKeepFilesCommandTemplate,
            description: 'Remove the movie from Radarr while keeping files on disk',
            params: { 'tmdb-id': { value: tmdbId, description: 'TMDB movie ID' } },
          },
        ])
      }

      return yield* wrap(removeMovie(tmdbId, { deleteFiles }))
    })
  )

const queueCommand = ({ args, limitFromArgs, recover, wrap }: RadarrInvocation) =>
  recover(
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(queue({ limit }), () =>
          Effect.succeed(listNextAction(queueLimitCommandTemplate, 'Return more active queue records'))
        )
      )
    )
  )

const calendarCommand = ({ args, limitFromArgs, recover, wrap }: RadarrInvocation) =>
  recover(
    limitFromArgs(args, daysFlag, defaultCalendarDays).pipe(
      Effect.flatMap((days) =>
        wrap(calendar({ days }), () =>
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

const missingCommand = ({ args, limitFromArgs, recover, wrap }: RadarrInvocation) =>
  recover(
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(missing({ limit }), () =>
          Effect.succeed(listNextAction(missingLimitCommandTemplate, 'Return more missing movie records'))
        )
      )
    )
  )

const historyCommand = ({ args, limitFromArgs, recover, wrap }: RadarrInvocation) =>
  recover(
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(history({ limit }), () =>
          Effect.succeed(listNextAction(historyLimitCommandTemplate, 'Return more history records'))
        )
      )
    )
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<CommandDefinition<RadarrCliResult, RadarrCliError, RadarrCliContext>> = [
  {
    name: 'status',
    description: { command: `${rootCommand} status`, description: 'Return the Radarr system status summary' },
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'config',
    description: { command: `${rootCommand} config`, description: 'Return root folders and quality profiles' },
    handle: ({ wrap }) => wrap(config),
  },
  {
    name: 'search',
    description: {
      command: `${rootCommand} search <query>`,
      description: 'Search Radarr lookup by movie title',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: searchCommand,
  },
  {
    name: 'exists',
    description: { command: existsCommandTemplate, description: 'Check whether a TMDB ID is already in the library' },
    handle: existsCommand,
  },
  {
    name: 'add',
    description: {
      command: addCommandTemplate,
      description: 'Add a movie by TMDB ID',
      flags: [
        {
          name: `${qualityProfileFlag} <quality-profile-id>`,
          description: 'Override the default Radarr quality profile',
        },
        { name: noSearchFlag, description: 'Add without searching for the movie' },
      ],
    },
    handle: addCommand,
  },
  {
    name: 'add-collection',
    description: {
      command: addCollectionCommandTemplate,
      description: 'Add movies from a known Radarr collection',
      flags: [
        { name: noSearchFlag, description: 'Add movies without searching' },
        { name: confirmAddCollectionFlag, description: 'Confirm the collection add' },
        {
          name: `${resultLimitFlag} <n>`,
          description: 'Maximum result records to include in the envelope',
          default: defaultAddCollectionResultLimit,
        },
      ],
    },
    handle: addCollectionCommand,
  },
  {
    name: 'collection-info',
    description: {
      command: collectionInfoCommandTemplate,
      description: 'Inspect a known Radarr collection by TMDB ID',
    },
    handle: collectionInfoCommand,
  },
  {
    name: 'remove',
    description: {
      command: `${rootCommand} remove <tmdb-id> [${deleteFilesFlag}] [${confirmDeleteFilesFlag}]`,
      description: 'Remove a movie by TMDB ID',
      flags: [
        { name: deleteFilesFlag, description: 'Request media file deletion' },
        { name: confirmDeleteFilesFlag, description: 'Confirm media file deletion' },
      ],
    },
    handle: removeCommand,
  },
  {
    name: 'queue',
    description: {
      command: `${rootCommand} queue [${limitFlag} <n>]`,
      description: 'Return active queue records',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: queueCommand,
  },
  {
    name: 'calendar',
    description: {
      command: `${rootCommand} calendar [${daysFlag} <n>]`,
      description: 'Return upcoming movies',
      flags: [{ name: `${daysFlag} <n>`, description: 'Number of days to include', default: defaultCalendarDays }],
    },
    handle: calendarCommand,
  },
  {
    name: 'missing',
    description: {
      command: `${rootCommand} missing [${limitFlag} <n>]`,
      description: 'Return monitored missing movies',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: missingCommand,
  },
  {
    name: 'history',
    description: {
      command: `${rootCommand} history [${limitFlag} <n>]`,
      description: 'Return recent history records',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: historyCommand,
  },
]

const execute = createCliRunner<RadarrCliResult, RadarrCliError, RadarrCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeRadarr = (args: ReadonlyArray<string>): Effect.Effect<RadarrCliEnvelope, never, RadarrCliContext> =>
  execute(args)
