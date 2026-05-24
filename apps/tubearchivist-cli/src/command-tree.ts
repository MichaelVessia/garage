import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultLimit } from '@garage/tubearchivist'

export interface RootHealth {
  readonly configured: boolean
  readonly health?: string | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'tubearchivist'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'tubearchivist'
export const limitFlag = '--limit'
export const confirmUnsubscribeFlag = '--confirm-unsubscribe'

export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: `${rootCommand} status`, description: 'Return health, config, and aggregate stats' },
  {
    command: `${rootCommand} channels [--limit <n>]`,
    description: 'Return indexed channels',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum channels to return', default: defaultLimit }],
  },
  { command: `${rootCommand} channel-info <channel_id>`, description: 'Return one channel' },
  {
    command: `${rootCommand} subscribe <url-or-id>`,
    description: 'Subscribe to a channel and queue Celery resolution',
  },
  {
    command: `${rootCommand} unsubscribe <channel_id> --confirm-unsubscribe`,
    description: 'Unsubscribe a channel',
    flags: [{ name: confirmUnsubscribeFlag, description: 'Required after user confirmation' }],
  },
  {
    command: `${rootCommand} videos [--limit <n>]`,
    description: 'Return recent indexed videos',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum videos to return', default: defaultLimit }],
  },
  { command: `${rootCommand} video-info <youtube_id>`, description: 'Return one video' },
  {
    command: `${rootCommand} downloads [--limit <n>]`,
    description: 'Return the pending download queue',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum downloads to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} playlists [--limit <n>]`,
    description: 'Return indexed playlists',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum playlists to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} tasks [--limit <n>]`,
    description: 'Return Celery task history',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum tasks to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} search <query> [--limit <n>]`,
    description: 'Search videos, channels, and playlists',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records per category', default: defaultLimit }],
  },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description:
    'Open a fresh shell after TUBEARCHIVIST_URL, TUBEARCHIVIST_USERNAME, and TUBEARCHIVIST_PASSWORD are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
