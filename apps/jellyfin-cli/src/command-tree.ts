import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultLimit } from '@garage/jellyfin'

export interface RootHealth {
  readonly configured: boolean
  readonly version?: string | undefined
  readonly serverName?: string | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'jellyfin'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'jellyfin'
export const limitFlag = '--limit'
export const confirmRunTaskFlag = '--confirm-run-task'
export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: `${rootCommand} status`, description: 'Return Jellyfin server status' },
  { command: `${rootCommand} users`, description: 'Return Jellyfin users' },
  { command: `${rootCommand} libraries`, description: 'Return Jellyfin libraries' },
  { command: `${rootCommand} sessions`, description: 'Return active sessions' },
  { command: `${rootCommand} now-playing`, description: 'Return sessions with active playback' },
  {
    command: `${rootCommand} recently-added [--limit <n>]`,
    description: 'Return recently added items',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} item-search <query> [--limit <n>]`,
    description: 'Search movies, series, and episodes',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  { command: `${rootCommand} library-stats`, description: 'Return Jellyfin item counts' },
  { command: `${rootCommand} scheduled-tasks`, description: 'Return scheduled tasks' },
  {
    command: `${rootCommand} run-task <task-id> [--confirm-run-task]`,
    description: 'Start a scheduled task',
    flags: [{ name: confirmRunTaskFlag, description: 'Confirm scheduled task start' }],
  },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after JELLYFIN_URL and JELLYFIN_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
