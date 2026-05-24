import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  channelInfo,
  channels,
  cliUsageError,
  defaultLimit,
  downloads,
  playlists,
  search,
  status,
  subscribe,
  tasks,
  unsubscribe,
  videoInfo,
  videos,
} from '@garage/tubearchivist'
import type {
  ChannelRecord,
  DownloadRecord,
  ListResult,
  PlaylistRecord,
  SearchResult,
  StatusResult,
  SubscriptionResult,
  TaskRecord,
  TubearchivistApi,
  TubearchivistConfig,
  TubearchivistError,
  VideoRecord,
} from '@garage/tubearchivist'
import { Effect } from 'effect'

import {
  commandTree,
  confirmUnsubscribeFlag,
  envNextAction,
  limitFlag,
  rootCommand,
  showCommandsAction,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type TubearchivistCliResult =
  | RootResult
  | StatusResult
  | ListResult<ChannelRecord>
  | ChannelRecord
  | SubscriptionResult
  | ListResult<VideoRecord>
  | VideoRecord
  | ListResult<DownloadRecord>
  | ListResult<PlaylistRecord>
  | ListResult<TaskRecord>
  | SearchResult

export type TubearchivistCliEnvelope = SuccessEnvelope<TubearchivistCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly toggles: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (
  command: string,
  error: TubearchivistError,
  nextActions: ReadonlyArray<NextAction>
): ErrorEnvelope =>
  errorEnvelope({ command, error: { code: error.code, message: error.message }, fix: error.fix, nextActions })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, TubearchivistError, TubearchivistApi | TubearchivistConfig>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, TubearchivistApi | TubearchivistConfig> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]), onSuccess: (x) => x })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, TubearchivistError> => {
  if (value === undefined) {
    return Effect.fail(cliUsageError(`${label} is required`))
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0
    ? Effect.succeed(parsed)
    : Effect.fail(cliUsageError(`${label} must be a positive integer`))
}

const parseFlags = (
  tokens: ReadonlyArray<string>,
  valueFlags: ReadonlyArray<string>,
  toggleFlags: ReadonlyArray<string> = []
): Effect.Effect<ParsedFlags, TubearchivistError> => {
  const positionals: Array<string> = []
  const values = new Map<string, string>()
  const toggles = new Set<string>()
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
    } else if (toggleFlags.includes(token)) {
      toggles.add(token)
      index += 1
    } else if (token.startsWith('-')) {
      return Effect.fail(cliUsageError(`Unknown flag ${token}`))
    } else {
      positionals.push(token)
      index += 1
    }
  }
  return Effect.succeed({ positionals, values, toggles })
}

const recoverEnvelope = (
  command: string,
  program: Effect.Effect<TubearchivistCliEnvelope, TubearchivistError, TubearchivistApi | TubearchivistConfig>
): Effect.Effect<TubearchivistCliEnvelope, never, TubearchivistApi | TubearchivistConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (
  command: string
): Effect.Effect<SuccessEnvelope<RootResult>, never, TubearchivistApi | TubearchivistConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'tubearchivist',
            description: 'Agent-first TubeArchivist CLI',
            commands: commandTree,
            health:
              error.code === 'TUBEARCHIVIST_ENV_MISSING'
                ? { configured: false }
                : { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: error.code === 'TUBEARCHIVIST_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        }),
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'tubearchivist',
            description: 'Agent-first TubeArchivist CLI',
            commands: commandTree,
            health: { configured: true, health: result.health },
          },
        }),
    })
  )

const limitFromArgs = (args: ReadonlyArray<string>) =>
  parseFlags(args, [limitFlag]).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(limitFlag)
      return value === undefined ? Effect.succeed(defaultLimit) : parseInteger(value, 'limit')
    })
  )

const limitCommand = <Result extends TubearchivistCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  program: (limit: number) => Effect.Effect<Result, TubearchivistError, TubearchivistApi | TubearchivistConfig>
) => recoverEnvelope(command, limitFromArgs(args).pipe(Effect.flatMap((limit) => wrap(command, program(limit)))))

const idCommand = <Result extends TubearchivistCliResult>(
  command: string,
  rest: ReadonlyArray<string>,
  label: string,
  program: (id: string) => Effect.Effect<Result, TubearchivistError, TubearchivistApi | TubearchivistConfig>
) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [])
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError(`${label} is required`)))
      }
      return yield* wrap(command, program(id))
    })
  )

const subscribeCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [])
      const target = parsed.positionals.join(' ').trim()
      if (target.length === 0) {
        return yield* wrap(command, Effect.fail(cliUsageError('channel url or id is required')))
      }
      return yield* wrap(command, subscribe({ target }))
    })
  )

const unsubscribeCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [], [confirmUnsubscribeFlag])
      const [target] = parsed.positionals
      if (target === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('channel id is required')))
      }
      return yield* wrap(command, unsubscribe({ target, confirmed: parsed.toggles.has(confirmUnsubscribeFlag) }))
    })
  )

const searchCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [limitFlag])
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(command, Effect.fail(cliUsageError('query is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? defaultLimit : yield* parseInteger(value, 'limit')
      return yield* wrap(command, search({ query, limit }))
    })
  )

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<TubearchivistCliEnvelope, never, TubearchivistApi | TubearchivistConfig> => {
  const command = commandString(args)
  const [name] = args
  const rest = args.slice(1)
  switch (name) {
    case undefined: {
      return root(command)
    }
    case 'status': {
      return wrap(command, status)
    }
    case 'channels': {
      return limitCommand(command, rest, (limit) => channels({ limit }))
    }
    case 'channel-info': {
      return idCommand(command, rest, 'channel id', (id) => channelInfo({ id }))
    }
    case 'subscribe': {
      return subscribeCommand(command, rest)
    }
    case 'unsubscribe': {
      return unsubscribeCommand(command, rest)
    }
    case 'videos': {
      return limitCommand(command, rest, (limit) => videos({ limit }))
    }
    case 'video-info': {
      return idCommand(command, rest, 'youtube id', (id) => videoInfo({ id }))
    }
    case 'downloads': {
      return limitCommand(command, rest, (limit) => downloads({ limit }))
    }
    case 'playlists': {
      return limitCommand(command, rest, (limit) => playlists({ limit }))
    }
    case 'tasks': {
      return limitCommand(command, rest, (limit) => tasks({ limit }))
    }
    case 'search': {
      return searchCommand(command, rest)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeTubearchivist = (
  args: ReadonlyArray<string>
): Effect.Effect<TubearchivistCliEnvelope, never, TubearchivistApi | TubearchivistConfig> => dispatch(args)
