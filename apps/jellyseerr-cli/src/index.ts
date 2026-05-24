import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  ParsedFlags,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  approve,
  confirmationRequired,
  decline,
  defaultLimit,
  deleteRequest,
  issues,
  mediaStatus,
  recentlyAdded,
  requestCounts,
  requests,
  search,
  status,
  users,
} from '@garage/jellyseerr'
import type {
  DeleteRequestResult,
  IssueRecord,
  JellyseerrApi,
  JellyseerrConfig,
  JellyseerrError,
  ListResult,
  MediaSummary,
  RequestCounts,
  RequestFilter,
  RequestRecord,
  SearchRecord,
  SystemStatus,
  UserRecord,
} from '@garage/jellyseerr'
import { Effect } from 'effect'

import {
  allFlag,
  approveCommandTemplate,
  approveConfirmedCommandTemplate,
  confirmApproveFlag,
  confirmDeclineFlag,
  confirmDeleteRequestFlag,
  declineCommandTemplate,
  declineConfirmedCommandTemplate,
  deleteRequestCommandTemplate,
  deleteRequestConfirmedCommandTemplate,
  envNextAction,
  issuesCommandTemplate,
  limitFlag,
  mediaStatusCommandTemplate,
  recentlyAddedCommandTemplate,
  requestCountsCommandTemplate,
  requestsCommandTemplate,
  rootCommand,
  searchCommandTemplate,
  showCommandsAction,
  statusCommandTemplate,
  usersCommandTemplate,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type JellyseerrCliResult =
  | RootResult
  | SystemStatus
  | ListResult<RequestRecord>
  | RequestCounts
  | ListResult<SearchRecord>
  | MediaSummary
  | ListResult<MediaSummary>
  | RequestRecord
  | DeleteRequestResult
  | ListResult<UserRecord>
  | ListResult<IssueRecord>

export type JellyseerrCliEnvelope = SuccessEnvelope<JellyseerrCliResult> | ErrorEnvelope
type JellyseerrCliError = JellyseerrError | CliUsageError
type JellyseerrCliContext = JellyseerrApi | JellyseerrConfig
type JellyseerrInvocation = CommandInvocation<JellyseerrCliResult, JellyseerrCliError, JellyseerrCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, JellyseerrCliContext> =>
  status.pipe(
    Effect.match({
      onFailure: (error) => {
        const health =
          error.code === 'JELLYSEERR_ENV_MISSING'
            ? { configured: false }
            : { configured: true, reachable: false, errorCode: error.code }

        return successEnvelope({
          command,
          result: {
            name: 'jellyseerr',
            description: 'Agent-first Jellyseerr CLI',
            commands: commandTree,
            health,
          },
          nextActions: error.code === 'JELLYSEERR_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        })
      },
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'jellyseerr',
            description: 'Agent-first Jellyseerr CLI',
            commands: commandTree,
            health: { configured: true, version: result.version },
          },
        }),
    })
  )

const limitFromParsed = (
  parsed: ParsedFlags,
  parsePositiveInteger: JellyseerrInvocation['parsePositiveInteger']
): Effect.Effect<number, JellyseerrCliError> => {
  const value = parsed.values.get(limitFlag)
  return value === undefined ? Effect.succeed(defaultLimit) : parsePositiveInteger(value, 'limit')
}

const requestsCommand = ({ args, parseFlags, parsePositiveInteger, recover, wrap }: JellyseerrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag], booleanFlags: [allFlag] })
      const limit = yield* limitFromParsed(parsed, parsePositiveInteger)
      const filter: RequestFilter = parsed.booleans.has(allFlag) ? 'all' : 'pending'
      return yield* wrap(requests({ limit, filter }))
    })
  )

const searchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: JellyseerrInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(Effect.fail(usageError('search query is required')))
      }
      const limit = yield* limitFromParsed(parsed, parsePositiveInteger)
      return yield* wrap(search({ query, limit }))
    })
  )

const mediaStatusCommand = ({ args, parsePositiveInteger, recover, wrap }: JellyseerrInvocation) =>
  recover(parsePositiveInteger(args[0], 'media-id').pipe(Effect.flatMap((mediaId) => wrap(mediaStatus(mediaId)))))

const limitCommand = <Result extends JellyseerrCliResult>(
  { args, parseFlags, parsePositiveInteger, recover, wrap }: JellyseerrInvocation,
  program: (limit: number) => Effect.Effect<Result, JellyseerrError, JellyseerrApi | JellyseerrConfig>
) =>
  recover(
    parseFlags(args, { valueFlags: [limitFlag] }).pipe(
      Effect.flatMap((parsed) => limitFromParsed(parsed, parsePositiveInteger)),
      Effect.flatMap((limit) => wrap(program(limit)))
    )
  )

const confirmationEnvelope = (
  errorToEnvelope: JellyseerrInvocation['errorToEnvelope'],
  action: string,
  flag: string,
  template: string,
  requestId: number
): ErrorEnvelope =>
  errorToEnvelope(confirmationRequired(action, flag), [
    {
      command: template,
      description: `${action} after user confirmation`,
      params: { 'request-id': { value: requestId, description: 'Jellyseerr request ID' } },
    },
  ])

const confirmedRequestCommand = (
  { args, errorToEnvelope, parseFlags, parsePositiveInteger, recover, wrap }: JellyseerrInvocation,
  flag: string,
  action: string,
  template: string,
  program: (
    requestId: number
  ) => Effect.Effect<RequestRecord | DeleteRequestResult, JellyseerrError, JellyseerrApi | JellyseerrConfig>
) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [flag] })
      const requestId = yield* parsePositiveInteger(parsed.positionals[0], 'request-id')

      if (!parsed.booleans.has(flag)) {
        return confirmationEnvelope(errorToEnvelope, action, flag, template, requestId)
      }

      return yield* wrap(program(requestId))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<
  CommandDefinition<JellyseerrCliResult, JellyseerrCliError, JellyseerrCliContext>
> = [
  {
    name: 'status',
    description: { command: statusCommandTemplate, description: 'Return Jellyseerr status' },
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'requests',
    description: {
      command: requestsCommandTemplate,
      description: 'Return pending media requests by default',
      flags: [
        { name: allFlag, description: 'Include all request states' },
        { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
      ],
    },
    handle: requestsCommand,
  },
  {
    name: 'request-counts',
    description: { command: requestCountsCommandTemplate, description: 'Return request totals by state' },
    handle: ({ wrap }) => wrap(requestCounts),
  },
  {
    name: 'search',
    description: {
      command: searchCommandTemplate,
      description: 'Search TMDB through Jellyseerr',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: searchCommand,
  },
  {
    name: 'media-status',
    description: { command: mediaStatusCommandTemplate, description: 'Return one Jellyseerr media row' },
    handle: mediaStatusCommand,
  },
  {
    name: 'recently-added',
    description: {
      command: recentlyAddedCommandTemplate,
      description: 'Return recently available media',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: (invocation) => limitCommand(invocation, (limit) => recentlyAdded({ limit })),
  },
  {
    name: 'approve',
    description: {
      command: approveCommandTemplate,
      description: 'Approve a media request',
      flags: [{ name: confirmApproveFlag, description: 'Confirm request approval' }],
    },
    handle: (invocation) =>
      confirmedRequestCommand(
        invocation,
        confirmApproveFlag,
        'Approve request',
        approveConfirmedCommandTemplate,
        approve
      ),
  },
  {
    name: 'decline',
    description: {
      command: declineCommandTemplate,
      description: 'Decline a media request',
      flags: [{ name: confirmDeclineFlag, description: 'Confirm request decline' }],
    },
    handle: (invocation) =>
      confirmedRequestCommand(
        invocation,
        confirmDeclineFlag,
        'Decline request',
        declineConfirmedCommandTemplate,
        decline
      ),
  },
  {
    name: 'delete-request',
    description: {
      command: deleteRequestCommandTemplate,
      description: 'Delete a media request',
      flags: [{ name: confirmDeleteRequestFlag, description: 'Confirm request deletion' }],
    },
    handle: (invocation) =>
      confirmedRequestCommand(
        invocation,
        confirmDeleteRequestFlag,
        'Delete request',
        deleteRequestConfirmedCommandTemplate,
        deleteRequest
      ),
  },
  {
    name: 'users',
    description: {
      command: usersCommandTemplate,
      description: 'Return Jellyseerr users',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: (invocation) => limitCommand(invocation, (limit) => users({ limit })),
  },
  {
    name: 'issues',
    description: {
      command: issuesCommandTemplate,
      description: 'Return open Jellyseerr issues',
      flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    },
    handle: (invocation) => limitCommand(invocation, (limit) => issues({ limit })),
  },
]

const execute = createCliRunner<JellyseerrCliResult, JellyseerrCliError, JellyseerrCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeJellyseerr = (
  args: ReadonlyArray<string>
): Effect.Effect<JellyseerrCliEnvelope, never, JellyseerrCliContext> => execute(args)
