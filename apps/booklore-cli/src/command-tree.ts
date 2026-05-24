import { defaultLimit } from '@garage/booklore'
import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  readonly current?: string | undefined
  readonly latest?: string | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'booklore'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'booklore'
export const limitFlag = '--limit'
export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: `${rootCommand} status`, description: 'Return BookLore version status' },
  { command: `${rootCommand} version`, description: 'Alias for status' },
  { command: `${rootCommand} me`, description: 'Return the logged-in BookLore user' },
  { command: `${rootCommand} libraries`, description: 'Return libraries and paths' },
  {
    command: `${rootCommand} books [--limit <n>]`,
    description: 'Return a bounded book list',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
  },
  { command: `${rootCommand} book-info <id>`, description: 'Return a single book record' },
  {
    command: `${rootCommand} search <query> [--limit <n>]`,
    description: 'Client-side title search across books',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
  },
  { command: `${rootCommand} shelves`, description: 'Return shelves visible to the logged-in user' },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after BOOKLORE_URL, BOOKLORE_USERNAME, and BOOKLORE_PASSWORD are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
