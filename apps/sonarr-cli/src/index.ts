import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  SonarrConfig,
  addSeries,
  calendar,
  cliUsageError,
  config,
  defaultCalendarDays,
  defaultLimit,
  deleteConfirmationRequired,
  exists,
  firstTvdbId,
  history,
  missing,
  queue,
  removeSeries,
  search,
  status,
} from '@garage/sonarr'
import type {
  AddSeriesResult,
  CalendarResult,
  ConfigSummary,
  EpisodeRecord,
  ExistsResult,
  HistoryRecord,
  ListResult,
  QueueRecord,
  RemoveSeriesResult,
  SearchResult,
  SonarrApi,
  SonarrError,
  SystemStatus,
} from '@garage/sonarr'
import { Effect, Option } from 'effect'

import {
  addCommandTemplate,
  calendarDaysCommandTemplate,
  commandTree,
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
  rootCommand,
  showCommandsAction,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type SonarrCliResult =
  | RootResult
  | SystemStatus
  | ConfigSummary
  | SearchResult
  | ExistsResult
  | AddSeriesResult
  | RemoveSeriesResult
  | ListResult<QueueRecord>
  | CalendarResult
  | ListResult<EpisodeRecord>
  | ListResult<HistoryRecord>

export type SonarrCliEnvelope = SuccessEnvelope<SonarrCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (command: string, error: SonarrError, nextActions: ReadonlyArray<NextAction>): ErrorEnvelope =>
  errorEnvelope({
    command,
    error: { code: error.code, message: error.message },
    fix: error.fix,
    nextActions,
  })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, SonarrError, SonarrApi | SonarrConfig>,
  nextActions: (
    result: Result
  ) => Effect.Effect<ReadonlyArray<NextAction>, SonarrError, SonarrApi | SonarrConfig> = () => Effect.succeed([])
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, SonarrApi | SonarrConfig> =>
  program.pipe(
    Effect.flatMap((result) =>
      nextActions(result).pipe(Effect.map((actions) => successEnvelope({ command, result, nextActions: actions })))
    ),
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, SonarrError> => {
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
): Effect.Effect<ParsedFlags, SonarrError> => {
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
  tvdbId: number,
  description = 'Add a selected series to Sonarr'
): Effect.Effect<NextAction, SonarrError, SonarrConfig> =>
  Effect.gen(function* () {
    const sonarrConfig = yield* SonarrConfig
    const values = yield* sonarrConfig.get

    return {
      command: addCommandTemplate,
      description,
      params: {
        'tvdb-id': { value: tvdbId, description: 'TVDB series ID' },
        'quality-profile-id': { default: values.defaultQualityProfileId, description: 'Sonarr quality profile ID' },
      },
    }
  })

const existsNextActions = (result: ExistsResult): Effect.Effect<ReadonlyArray<NextAction>, SonarrError, SonarrConfig> =>
  result.exists
    ? Effect.succeed([])
    : defaultQualityProfileAction(result.tvdbId, 'Add this TVDB series to Sonarr').pipe(
        Effect.map((action) => [action])
      )

const searchNextActions = (result: SearchResult): Effect.Effect<ReadonlyArray<NextAction>, SonarrError, SonarrConfig> =>
  Option.match(firstTvdbId(result.results), {
    onNone: () => Effect.succeed([]),
    onSome: (tvdbId) =>
      defaultQualityProfileAction(tvdbId).pipe(
        Effect.map((addAction) => [
          {
            command: existsCommandTemplate,
            description: 'Check whether a selected series is already in the library',
            params: { 'tvdb-id': { value: tvdbId, description: 'TVDB series ID' } },
          },
          addAction,
        ])
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
  program: Effect.Effect<SonarrCliEnvelope, SonarrError, SonarrApi | SonarrConfig>
): Effect.Effect<SonarrCliEnvelope, never, SonarrApi | SonarrConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, SonarrApi | SonarrConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) => {
        const health =
          error.code === 'SONARR_ENV_MISSING'
            ? { configured: false }
            : { configured: true, reachable: false, errorCode: error.code }

        return successEnvelope({
          command,
          result: {
            name: 'sonarr',
            description: 'Agent-first Sonarr CLI',
            commands: commandTree,
            health,
          },
          nextActions: error.code === 'SONARR_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        })
      },
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'sonarr',
            description: 'Agent-first Sonarr CLI',
            commands: commandTree,
            health: { configured: true, appName: result.appName, version: result.version },
          },
        }),
    })
  )

const statusCommand = (command: string) => wrap(command, status)
const configCommand = (command: string) => wrap(command, config)

const searchCommand = (command: string, args: ReadonlyArray<string>) => {
  const query = args.join(' ').trim()
  return query.length === 0
    ? wrap(command, Effect.fail(cliUsageError('search query is required')))
    : wrap(command, search(query, { limit: defaultLimit }), searchNextActions)
}

const existsCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    parseInteger(args[0], 'tvdb-id').pipe(Effect.flatMap((tvdbId) => wrap(command, exists(tvdbId), existsNextActions)))
  )

const addCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [qualityProfileFlag], [noSearchFlag])
      const tvdbId = yield* parseInteger(parsed.positionals[0], 'tvdb-id')
      const qualityProfileValue = parsed.values.get(qualityProfileFlag)
      const qualityProfileId =
        qualityProfileValue === undefined ? undefined : yield* parseInteger(qualityProfileValue, 'quality-profile-id')
      const searchForMissingEpisodes = !parsed.booleans.has(noSearchFlag)
      const options =
        qualityProfileId === undefined ? { searchForMissingEpisodes } : { qualityProfileId, searchForMissingEpisodes }

      return yield* wrap(command, addSeries(tvdbId, options))
    })
  )

const removeDeleteConfirmationEnvelope = (command: string, tvdbId: number): ErrorEnvelope =>
  errorToEnvelope(command, deleteConfirmationRequired(), [
    {
      command: removeKeepFilesCommandTemplate,
      description: 'Remove the series from Sonarr while keeping files on disk',
      params: { 'tvdb-id': { value: tvdbId, description: 'TVDB series ID' } },
    },
  ])

const removeCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [], [deleteFilesFlag, confirmDeleteFilesFlag])
      const tvdbId = yield* parseInteger(parsed.positionals[0], 'tvdb-id')
      const deleteFiles = parsed.booleans.has(deleteFilesFlag)

      if (deleteFiles && !parsed.booleans.has(confirmDeleteFilesFlag)) {
        return removeDeleteConfirmationEnvelope(command, tvdbId)
      }

      return yield* wrap(command, removeSeries(tvdbId, { deleteFiles }))
    })
  )

const limitFromArgs = (
  args: ReadonlyArray<string>,
  flagName: string,
  defaultValue: number
): Effect.Effect<number, SonarrError> =>
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
              description: 'Change the upcoming episode day window',
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
          Effect.succeed(listNextAction(missingLimitCommandTemplate, 'Return more missing episode records'))
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

const dispatch = (args: ReadonlyArray<string>): Effect.Effect<SonarrCliEnvelope, never, SonarrApi | SonarrConfig> => {
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

export const executeSonarr = (
  args: ReadonlyArray<string>
): Effect.Effect<SonarrCliEnvelope, never, SonarrApi | SonarrConfig> => dispatch(args)
