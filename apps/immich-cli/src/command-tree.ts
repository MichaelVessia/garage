import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultLimit } from '@garage/immich'

export interface RootHealth {
  readonly configured: boolean
  readonly version?: string | undefined
  readonly ping?: string | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'immich'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'immich'
export const limitFlag = '--limit'
export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: `${rootCommand} status`, description: 'Return Immich version and ping' },
  { command: `${rootCommand} stats`, description: 'Return library photo, video, usage, and per-user stats' },
  { command: `${rootCommand} storage`, description: 'Return storage capacity and usage' },
  { command: `${rootCommand} users`, description: 'Return users, preferring admin fields when available' },
  { command: `${rootCommand} me`, description: 'Return the user attached to the API key' },
  {
    command: `${rootCommand} albums [--limit <n>]`,
    description: 'Return visible albums',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} album-info <id> [--limit <n>]`,
    description: 'Return album metadata and a bounded asset sample',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum assets to include', default: defaultLimit }],
  },
  {
    command: `${rootCommand} search <query> [--limit <n>]`,
    description: 'Run smart search, falling back to filename metadata search',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum assets to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} recent [--limit <n>]`,
    description: 'Return recent assets',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum assets to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} people [--limit <n>]`,
    description: 'Return visible people',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum people to return', default: defaultLimit }],
  },
  { command: `${rootCommand} person-info <id>`, description: 'Return person detail' },
  { command: `${rootCommand} jobs`, description: 'Return background job queues' },
  { command: `${rootCommand} library-stats`, description: 'Alias for stats' },
  { command: `${rootCommand} tags`, description: 'Return tags' },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after IMMICH_URL and IMMICH_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
