import { defaultLimit } from '@garage/autocaliweb'
import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  readonly title?: string | undefined
  readonly books?: number | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'autocaliweb'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'autocaliweb'
export const limitFlag = '--limit'
export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: `${rootCommand} status`, description: 'Return Autocaliweb OPDS status and catalog stats' },
  { command: `${rootCommand} version`, description: 'Alias for status' },
  { command: `${rootCommand} stats`, description: 'Return Autocaliweb database counts' },
  { command: `${rootCommand} catalog`, description: 'Return top-level OPDS catalog entries' },
  {
    command: `${rootCommand} books [--limit <n>]`,
    description: 'Return a bounded alphabetical book list',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} recent [--limit <n>]`,
    description: 'Return recently added books',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} search <query> [--limit <n>]`,
    description: 'Search books through OPDS',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum books to return', default: defaultLimit }],
  },
  { command: `${rootCommand} book-info <uuid>`, description: 'Return Calibre Companion metadata for a book UUID' },
  { command: `${rootCommand} shelves`, description: 'Return OPDS shelves visible to the logged-in user' },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after AUTOCALIWEB_URL, AUTOCALIWEB_USERNAME, and AUTOCALIWEB_PASSWORD are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
