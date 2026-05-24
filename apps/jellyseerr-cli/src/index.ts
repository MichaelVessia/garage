import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  approve,
  cliUsageError,
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
  approveConfirmedCommandTemplate,
  commandTree,
  confirmApproveFlag,
  confirmDeclineFlag,
  confirmDeleteRequestFlag,
  declineConfirmedCommandTemplate,
  deleteRequestConfirmedCommandTemplate,
  envNextAction,
  limitFlag,
  rootCommand,
  showCommandsAction,
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

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (
  command: string,
  error: JellyseerrError,
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
  program: Effect.Effect<Result, JellyseerrError, JellyseerrApi | JellyseerrConfig>,
  nextActions: (
    result: Result
  ) => Effect.Effect<ReadonlyArray<NextAction>, JellyseerrError, JellyseerrApi | JellyseerrConfig> = () =>
    Effect.succeed([])
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, JellyseerrApi | JellyseerrConfig> =>
  program.pipe(
    Effect.flatMap((result) =>
      nextActions(result).pipe(Effect.map((actions) => successEnvelope({ command, result, nextActions: actions })))
    ),
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, JellyseerrError> => {
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
): Effect.Effect<ParsedFlags, JellyseerrError> => {
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
  program: Effect.Effect<JellyseerrCliEnvelope, JellyseerrError, JellyseerrApi | JellyseerrConfig>
): Effect.Effect<JellyseerrCliEnvelope, never, JellyseerrApi | JellyseerrConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, JellyseerrApi | JellyseerrConfig> =>
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

const limitFromParsed = (parsed: ParsedFlags): Effect.Effect<number, JellyseerrError> => {
  const value = parsed.values.get(limitFlag)
  return value === undefined ? Effect.succeed(defaultLimit) : parseInteger(value, 'limit')
}

const idFromArgs = (args: ReadonlyArray<string>, label: string): Effect.Effect<number, JellyseerrError> =>
  parseInteger(args[0], label)

const statusCommand = (command: string) => wrap(command, status)
const requestCountsCommand = (command: string) => wrap(command, requestCounts)

const requestsCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [limitFlag], [allFlag])
      const limit = yield* limitFromParsed(parsed)
      const filter: RequestFilter = parsed.booleans.has(allFlag) ? 'all' : 'pending'
      return yield* wrap(command, requests({ limit, filter }))
    })
  )

const searchCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [limitFlag], [])
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(command, Effect.fail(cliUsageError('search query is required')))
      }
      const limit = yield* limitFromParsed(parsed)
      return yield* wrap(command, search({ query, limit }))
    })
  )

const mediaStatusCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    idFromArgs(args, 'media-id').pipe(Effect.flatMap((mediaId) => wrap(command, mediaStatus(mediaId))))
  )

const limitCommand = <Result extends JellyseerrCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  program: (limit: number) => Effect.Effect<Result, JellyseerrError, JellyseerrApi | JellyseerrConfig>
) =>
  recoverEnvelope(
    command,
    parseFlags(args, [limitFlag], []).pipe(
      Effect.flatMap(limitFromParsed),
      Effect.flatMap((limit) => wrap(command, program(limit)))
    )
  )

const confirmationEnvelope = (
  command: string,
  action: string,
  flag: string,
  template: string,
  requestId: number
): ErrorEnvelope =>
  errorToEnvelope(command, confirmationRequired(action, flag), [
    {
      command: template,
      description: `${action} after user confirmation`,
      params: { 'request-id': { value: requestId, description: 'Jellyseerr request ID' } },
    },
  ])

const confirmedRequestCommand = (
  command: string,
  args: ReadonlyArray<string>,
  flag: string,
  action: string,
  template: string,
  program: (
    requestId: number
  ) => Effect.Effect<RequestRecord | DeleteRequestResult, JellyseerrError, JellyseerrApi | JellyseerrConfig>
) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [], [flag])
      const requestId = yield* parseInteger(parsed.positionals[0], 'request-id')

      if (!parsed.booleans.has(flag)) {
        return confirmationEnvelope(command, action, flag, template, requestId)
      }

      return yield* wrap(command, program(requestId))
    })
  )

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<JellyseerrCliEnvelope, never, JellyseerrApi | JellyseerrConfig> => {
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
    case 'requests': {
      return requestsCommand(command, rest)
    }
    case 'request-counts': {
      return requestCountsCommand(command)
    }
    case 'search': {
      return searchCommand(command, rest)
    }
    case 'media-status': {
      return mediaStatusCommand(command, rest)
    }
    case 'recently-added': {
      return limitCommand(command, rest, (limit) => recentlyAdded({ limit }))
    }
    case 'approve': {
      return confirmedRequestCommand(
        command,
        rest,
        confirmApproveFlag,
        'Approve request',
        approveConfirmedCommandTemplate,
        approve
      )
    }
    case 'decline': {
      return confirmedRequestCommand(
        command,
        rest,
        confirmDeclineFlag,
        'Decline request',
        declineConfirmedCommandTemplate,
        decline
      )
    }
    case 'delete-request': {
      return confirmedRequestCommand(
        command,
        rest,
        confirmDeleteRequestFlag,
        'Delete request',
        deleteRequestConfirmedCommandTemplate,
        deleteRequest
      )
    }
    case 'users': {
      return limitCommand(command, rest, (limit) => users({ limit }))
    }
    case 'issues': {
      return limitCommand(command, rest, (limit) => issues({ limit }))
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeJellyseerr = (
  args: ReadonlyArray<string>
): Effect.Effect<JellyseerrCliEnvelope, never, JellyseerrApi | JellyseerrConfig> => dispatch(args)
