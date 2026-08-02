import { createCliRunner, createCliUsageError, makeRoot } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import {
  channelInfo,
  channels,
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
  TubearchivistError,
  VideoRecord,
} from '@garage/tubearchivist'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Str from 'effect/String'

import { confirmUnsubscribeFlag, envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootHealth, RootResult } from './command-tree.js'

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
type TubearchivistCliError = TubearchivistError | CliUsageError
type TubearchivistCliContext = TubearchivistApi
type TubearchivistInvocation = CommandInvocation<TubearchivistCliResult, TubearchivistCliError, TubearchivistCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, TubearchivistCliContext> =>
  makeRoot({
    command,
    commandTree,
    name: 'tubearchivist',
    description: 'Agent-first TubeArchivist CLI',
    status,
    envMissingCode: 'TUBEARCHIVIST_ENV_MISSING',
    envNextAction,
    showCommandsAction,
    onReachable: (result) =>
      Option.match(Option.fromUndefinedOr(result.health), {
        onNone: (): RootHealth => ({ configured: true, reachable: true }),
        onSome: (health): RootHealth => ({ configured: true, health }),
      }),
  })

const limitCommand = <Result extends TubearchivistCliResult>(
  { args, limitFromArgs, recover, wrap }: TubearchivistInvocation,
  program: (limit: number) => Effect.Effect<Result, TubearchivistError, TubearchivistApi>
) => recover(limitFromArgs(args, limitFlag, defaultLimit).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const idCommand = <Result extends TubearchivistCliResult>(
  { args, parseFlags, recover, usageError, wrap }: TubearchivistInvocation,
  label: string,
  program: (id: string) => Effect.Effect<Result, TubearchivistError, TubearchivistApi>
) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args)
      const [id] = parsed.positionals
      if (id === undefined) {
        return yield* wrap(Effect.fail(usageError(`${label} is required`)))
      }
      return yield* wrap(program(id))
    })
  )

const subscribeCommand = ({ args, parseFlags, recover, usageError, wrap }: TubearchivistInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args)
      const target = parsed.positionals.join(' ').trim()
      if (Str.isEmpty(target)) {
        return yield* wrap(Effect.fail(usageError('channel url or id is required')))
      }
      return yield* wrap(subscribe({ target }))
    })
  )

const unsubscribeCommand = ({ args, parseFlags, recover, usageError, wrap }: TubearchivistInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [confirmUnsubscribeFlag] })
      const [target] = parsed.positionals
      if (target === undefined) {
        return yield* wrap(Effect.fail(usageError('channel id is required')))
      }
      return yield* wrap(unsubscribe({ target, confirmed: parsed.booleans.has(confirmUnsubscribeFlag) }))
    })
  )

const searchCommand = ({
  args,
  parseFlags,
  parsePositiveInteger,
  recover,
  usageError,
  wrap,
}: TubearchivistInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const query = parsed.positionals.join(' ').trim()
      if (Str.isEmpty(query)) {
        return yield* wrap(Effect.fail(usageError('query is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? defaultLimit : yield* parsePositiveInteger(value, 'limit')
      return yield* wrap(search({ query, limit }))
    })
  )

const commandDefinitions: ReadonlyArray<
  CommandDefinition<TubearchivistCliResult, TubearchivistCliError, TubearchivistCliContext>
> = [
  {
    name: 'status',
    command: `${rootCommand} status`,
    description: 'Return health, config, and aggregate stats',
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'channels',
    command: `${rootCommand} channels [${limitFlag} <n>]`,
    description: 'Return indexed channels',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum channels to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => channels({ limit })),
  },
  {
    name: 'channel-info',
    command: `${rootCommand} channel-info <channel_id>`,
    description: 'Return one channel',
    handle: (invocation) => idCommand(invocation, 'channel id', (id) => channelInfo({ id })),
  },
  {
    name: 'subscribe',
    command: `${rootCommand} subscribe <url-or-id>`,
    description: 'Subscribe to a channel and queue Celery resolution',
    handle: subscribeCommand,
  },
  {
    name: 'unsubscribe',
    command: `${rootCommand} unsubscribe <channel_id> ${confirmUnsubscribeFlag}`,
    description: 'Unsubscribe a channel',
    flags: [{ name: confirmUnsubscribeFlag, description: 'Required after user confirmation' }],
    handle: unsubscribeCommand,
  },
  {
    name: 'videos',
    command: `${rootCommand} videos [${limitFlag} <n>]`,
    description: 'Return recent indexed videos',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum videos to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => videos({ limit })),
  },
  {
    name: 'video-info',
    command: `${rootCommand} video-info <youtube_id>`,
    description: 'Return one video',
    handle: (invocation) => idCommand(invocation, 'youtube id', (id) => videoInfo({ id })),
  },
  {
    name: 'downloads',
    command: `${rootCommand} downloads [${limitFlag} <n>]`,
    description: 'Return the pending download queue',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum downloads to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => downloads({ limit })),
  },
  {
    name: 'playlists',
    command: `${rootCommand} playlists [${limitFlag} <n>]`,
    description: 'Return indexed playlists',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum playlists to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => playlists({ limit })),
  },
  {
    name: 'tasks',
    command: `${rootCommand} tasks [${limitFlag} <n>]`,
    description: 'Return Celery task history',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum tasks to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => tasks({ limit })),
  },
  {
    name: 'search',
    command: `${rootCommand} search <query> [${limitFlag} <n>]`,
    description: 'Search videos, channels, and playlists',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records per category', default: defaultLimit }],
    handle: searchCommand,
  },
]

const execute = createCliRunner<TubearchivistCliResult, TubearchivistCliError, TubearchivistCliContext>({
  rootCommand,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeTubearchivist = (
  args: ReadonlyArray<string>
): Effect.Effect<TubearchivistCliEnvelope, never, TubearchivistCliContext> => execute(args)
