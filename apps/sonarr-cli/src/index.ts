import { createCliRunner, createCliUsageError, makeRoot } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  NextAction,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  SonarrConfig,
  addSeries,
  calendar,
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
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import {
  addCommandTemplate,
  calendarDaysCommandTemplate,
  configCommandTemplate,
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
  searchCommandTemplate,
  showCommandsAction,
  statusCommandTemplate,
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
type SonarrCliError = SonarrError | CliUsageError
type SonarrCliContext = SonarrApi | SonarrConfig
type SonarrInvocation = CommandInvocation<SonarrCliResult, SonarrCliError, SonarrCliContext>

const defaultQualityProfileAction = Effect.fn('sonarrCli.defaultQualityProfileAction')(function* (
  tvdbId: number,
  description?: string
): Effect.fn.Return<NextAction, SonarrError, SonarrConfig> {
  const sonarrConfig = yield* SonarrConfig
  const values = yield* sonarrConfig.get()

  return {
    command: addCommandTemplate,
    description: description ?? 'Add a selected series to Sonarr',
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

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, SonarrCliContext> =>
  makeRoot({
    command,
    commandTree,
    name: 'sonarr',
    description: 'Agent-first Sonarr CLI',
    status,
    envMissingCode: 'SONARR_ENV_MISSING',
    envNextAction,
    showCommandsAction,
    onReachable: (result) => ({ configured: true, appName: result.appName, version: result.version }),
  })

const searchCommand = ({ args, usageError, wrap }: SonarrInvocation) => {
  const query = args.join(' ').trim()
  // oxlint-disable-next-line effect/no-length-comparison -- query is a string; checking for empty search input, not an array
  return query.length === 0
    ? wrap(Effect.fail(usageError('search query is required')))
    : wrap(search(query, { limit: defaultLimit }), searchNextActions)
}

const existsCommand = ({ args, parsePositiveInteger, recover, wrap }: SonarrInvocation) =>
  recover(
    parsePositiveInteger(args[0], 'tvdb-id').pipe(Effect.flatMap((tvdbId) => wrap(exists(tvdbId), existsNextActions)))
  )

const addCommand = ({ args, parseFlags, parsePositiveInteger, recover, wrap }: SonarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [qualityProfileFlag], booleanFlags: [noSearchFlag] })
      const tvdbId = yield* parsePositiveInteger(parsed.positionals[0], 'tvdb-id')
      const qualityProfileValue = parsed.values.get(qualityProfileFlag)
      const qualityProfileId =
        qualityProfileValue === undefined
          ? undefined
          : yield* parsePositiveInteger(qualityProfileValue, 'quality-profile-id')
      const searchForMissingEpisodes = !parsed.booleans.has(noSearchFlag)
      const options =
        qualityProfileId === undefined ? { searchForMissingEpisodes } : { qualityProfileId, searchForMissingEpisodes }

      return yield* wrap(addSeries(tvdbId, options))
    })
  )

const removeCommand = ({ args, errorToEnvelope, parseFlags, parsePositiveInteger, recover, wrap }: SonarrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [deleteFilesFlag, confirmDeleteFilesFlag] })
      const tvdbId = yield* parsePositiveInteger(parsed.positionals[0], 'tvdb-id')
      const deleteFiles = parsed.booleans.has(deleteFilesFlag)

      if (deleteFiles && !parsed.booleans.has(confirmDeleteFilesFlag)) {
        return errorToEnvelope(deleteConfirmationRequired(), [
          {
            command: removeKeepFilesCommandTemplate,
            description: 'Remove the series from Sonarr while keeping files on disk',
            params: { 'tvdb-id': { value: tvdbId, description: 'TVDB series ID' } },
          },
        ])
      }

      return yield* wrap(removeSeries(tvdbId, { deleteFiles }))
    })
  )

const queueCommand = ({ args, limitFromArgs, recover, wrap }: SonarrInvocation) =>
  recover(
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(queue({ limit }), () =>
          Effect.succeed(listNextAction(queueLimitCommandTemplate, 'Return more active queue records'))
        )
      )
    )
  )

const calendarCommand = ({ args, limitFromArgs, recover, wrap }: SonarrInvocation) =>
  recover(
    limitFromArgs(args, daysFlag, defaultCalendarDays).pipe(
      Effect.flatMap((days) =>
        wrap(calendar({ days }), () =>
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

const missingCommand = ({ args, limitFromArgs, recover, wrap }: SonarrInvocation) =>
  recover(
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(missing({ limit }), () =>
          Effect.succeed(listNextAction(missingLimitCommandTemplate, 'Return more missing episode records'))
        )
      )
    )
  )

const historyCommand = ({ args, limitFromArgs, recover, wrap }: SonarrInvocation) =>
  recover(
    limitFromArgs(args, limitFlag, defaultLimit).pipe(
      Effect.flatMap((limit) =>
        wrap(history({ limit }), () =>
          Effect.succeed(listNextAction(historyLimitCommandTemplate, 'Return more history records'))
        )
      )
    )
  )

const commandDefinitions: ReadonlyArray<CommandDefinition<SonarrCliResult, SonarrCliError, SonarrCliContext>> = [
  {
    name: 'status',
    command: statusCommandTemplate,
    description: 'Return the Sonarr system status summary',
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'config',
    command: configCommandTemplate,
    description: 'Return root folders and quality profiles',
    handle: ({ wrap }) => wrap(config),
  },
  {
    name: 'search',
    command: searchCommandTemplate,
    description: 'Search Sonarr lookup by series title',
    handle: searchCommand,
  },
  {
    name: 'exists',
    command: existsCommandTemplate,
    description: 'Check whether a TVDB ID is already in the library',
    handle: existsCommand,
  },
  {
    name: 'add',
    command: addCommandTemplate,
    description: 'Add a series by TVDB ID',
    flags: [
      {
        name: `${qualityProfileFlag} <quality-profile-id>`,
        description: 'Override the default Sonarr quality profile',
      },
      { name: noSearchFlag, description: 'Add without searching for missing episodes' },
    ],
    handle: addCommand,
  },
  {
    name: 'remove',
    command: `${rootCommand} remove <tvdb-id> [${deleteFilesFlag}] [${confirmDeleteFilesFlag}]`,
    description: 'Remove a series by TVDB ID',
    flags: [
      { name: deleteFilesFlag, description: 'Request media file deletion' },
      { name: confirmDeleteFilesFlag, description: 'Confirm media file deletion' },
    ],
    handle: removeCommand,
  },
  {
    name: 'queue',
    command: `${rootCommand} queue [${limitFlag} <n>]`,
    description: 'Return active queue records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: queueCommand,
  },
  {
    name: 'calendar',
    command: `${rootCommand} calendar [${daysFlag} <n>]`,
    description: 'Return upcoming episodes',
    flags: [{ name: `${daysFlag} <n>`, description: 'Number of days to include', default: defaultCalendarDays }],
    handle: calendarCommand,
  },
  {
    name: 'missing',
    command: `${rootCommand} missing [${limitFlag} <n>]`,
    description: 'Return monitored missing episodes',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: missingCommand,
  },
  {
    name: 'history',
    command: `${rootCommand} history [${limitFlag} <n>]`,
    description: 'Return recent history records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: historyCommand,
  },
]

const execute = createCliRunner<SonarrCliResult, SonarrCliError, SonarrCliContext>({
  rootCommand,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeSonarr = (args: ReadonlyArray<string>): Effect.Effect<SonarrCliEnvelope, never, SonarrCliContext> =>
  execute(args)
