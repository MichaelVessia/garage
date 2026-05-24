import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  cliUsageError,
  defaultHistoryLimit,
  defaultLimit,
  deleteConfirmationRequired,
  deleteQueueItem,
  history,
  pause,
  queue,
  resume,
  serverStats,
  status,
  version,
} from '@garage/sabnzbd'
import type {
  ActionResult,
  HistoryResult,
  QueueResult,
  SabnzbdApi,
  SabnzbdConfig,
  SabnzbdError,
  ServerStats,
  SystemStatus,
  VersionResult,
} from '@garage/sabnzbd'
import { Effect } from 'effect'

import {
  commandTree,
  confirmDeleteFilesFlag,
  deleteKeepFilesCommandTemplate,
  envNextAction,
  filesFlag,
  historyLimitCommandTemplate,
  limitFlag,
  queueLimitCommandTemplate,
  rootCommand,
  showCommandsAction,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type SabnzbdCliResult =
  | RootResult
  | SystemStatus
  | VersionResult
  | QueueResult
  | HistoryResult
  | ActionResult
  | ServerStats

export type SabnzbdCliEnvelope = SuccessEnvelope<SabnzbdCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (command: string, error: SabnzbdError, nextActions: ReadonlyArray<NextAction>): ErrorEnvelope =>
  errorEnvelope({
    command,
    error: { code: error.code, message: error.message },
    fix: error.fix,
    nextActions,
  })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, SabnzbdError, SabnzbdApi | SabnzbdConfig>,
  nextActions: (
    result: Result
  ) => Effect.Effect<ReadonlyArray<NextAction>, SabnzbdError, SabnzbdApi | SabnzbdConfig> = () => Effect.succeed([])
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, SabnzbdApi | SabnzbdConfig> =>
  program.pipe(
    Effect.flatMap((result) =>
      nextActions(result).pipe(Effect.map((actions) => successEnvelope({ command, result, nextActions: actions })))
    ),
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, SabnzbdError> => {
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
): Effect.Effect<ParsedFlags, SabnzbdError> => {
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
  program: Effect.Effect<SabnzbdCliEnvelope, SabnzbdError, SabnzbdApi | SabnzbdConfig>
): Effect.Effect<SabnzbdCliEnvelope, never, SabnzbdApi | SabnzbdConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, SabnzbdApi | SabnzbdConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) => {
        const health =
          error.code === 'SABNZBD_ENV_MISSING'
            ? { configured: false }
            : { configured: true, reachable: false, errorCode: error.code }

        return successEnvelope({
          command,
          result: {
            name: 'sabnzbd',
            description: 'Agent-first SABnzbd CLI',
            commands: commandTree,
            health,
          },
          nextActions: error.code === 'SABNZBD_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        })
      },
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'sabnzbd',
            description: 'Agent-first SABnzbd CLI',
            commands: commandTree,
            health: { configured: true, version: result.version, paused: result.paused },
          },
        }),
    })
  )

const limitFromArgs = (
  args: ReadonlyArray<string>,
  defaultValue: number,
  positionalAllowed: boolean
): Effect.Effect<number, SabnzbdError> =>
  parseFlags(args, [limitFlag], []).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(limitFlag)
      if (value !== undefined) {
        return parseInteger(value, 'limit')
      }

      const [positional] = parsed.positionals
      if (positionalAllowed && positional !== undefined) {
        return parseInteger(positional, 'limit')
      }

      return Effect.succeed(defaultValue)
    })
  )

const listNextAction = (command: string, description: string, defaultLimitValue: number): ReadonlyArray<NextAction> => [
  {
    command,
    description,
    params: { limit: { default: defaultLimitValue, description: 'Maximum records to return' } },
  },
]

const statusCommand = (command: string) => wrap(command, status)
const versionCommand = (command: string) => wrap(command, version)

const queueCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    limitFromArgs(args, defaultLimit, false).pipe(
      Effect.flatMap((limit) =>
        wrap(command, queue({ limit }), () =>
          Effect.succeed(listNextAction(queueLimitCommandTemplate, 'Return more queue records', defaultLimit))
        )
      )
    )
  )

const historyCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    limitFromArgs(args, defaultHistoryLimit, true).pipe(
      Effect.flatMap((limit) =>
        wrap(command, history({ limit }), () =>
          Effect.succeed(
            listNextAction(historyLimitCommandTemplate, 'Return more history records', defaultHistoryLimit)
          )
        )
      )
    )
  )

const pauseCommand = (command: string) => wrap(command, pause)
const resumeCommand = (command: string) => wrap(command, resume)

const deleteConfirmationEnvelope = (command: string, nzoId: string): ErrorEnvelope =>
  errorToEnvelope(command, deleteConfirmationRequired(), [
    {
      command: deleteKeepFilesCommandTemplate,
      description: 'Delete the queue item while keeping downloaded files',
      params: { 'nzo-id': { value: nzoId, description: 'SABnzbd NZO ID' } },
    },
  ])

const deleteCommand = (command: string, args: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, [], [filesFlag, confirmDeleteFilesFlag])
      const [nzoId] = parsed.positionals

      if (nzoId === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('nzo-id is required')))
      }

      const deleteFiles = parsed.booleans.has(filesFlag)
      if (deleteFiles && !parsed.booleans.has(confirmDeleteFilesFlag)) {
        return deleteConfirmationEnvelope(command, nzoId)
      }

      return yield* wrap(command, deleteQueueItem(nzoId, { deleteFiles }))
    })
  )

const serverStatsCommand = (command: string) => wrap(command, serverStats)

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<SabnzbdCliEnvelope, never, SabnzbdApi | SabnzbdConfig> => {
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
    case 'version': {
      return versionCommand(command)
    }
    case 'queue': {
      return queueCommand(command, rest)
    }
    case 'history': {
      return historyCommand(command, rest)
    }
    case 'pause': {
      return pauseCommand(command)
    }
    case 'resume': {
      return resumeCommand(command)
    }
    case 'delete': {
      return deleteCommand(command, rest)
    }
    case 'server-stats': {
      return serverStatsCommand(command)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeSabnzbd = (
  args: ReadonlyArray<string>
): Effect.Effect<SabnzbdCliEnvelope, never, SabnzbdApi | SabnzbdConfig> => dispatch(args)
