import { defaultLimit, searchLimit } from '@garage/adguard'
import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  readonly version?: string | undefined
  readonly protectionEnabled?: boolean | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'adguard'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'adguard'
export const limitFlag = '--limit'
export const confirmToggleFlag = '--confirm-toggle'
export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: `${rootCommand} status`, description: 'Return AdGuard Home status' },
  { command: `${rootCommand} version`, description: 'Return AdGuard Home version' },
  { command: `${rootCommand} stats`, description: 'Return DNS counters and top domains or clients' },
  { command: `${rootCommand} stats-info`, description: 'Return stats retention interval' },
  {
    command: `${rootCommand} query-log [--limit <n>]`,
    description: 'Return recent DNS queries',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: `${rootCommand} query-log-search <query> [--limit <n>]`,
    description: 'Search recent DNS queries',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: searchLimit }],
  },
  { command: `${rootCommand} clients`, description: 'Return configured and auto-detected clients' },
  { command: `${rootCommand} clients-active <ip>`, description: 'Lookup one active client by IP' },
  { command: `${rootCommand} filters`, description: 'Return blocklists, allowlists, and custom rule count' },
  { command: `${rootCommand} rules`, description: 'Return custom user rules' },
  { command: `${rootCommand} dns-config`, description: 'Return full DNS server config' },
  { command: `${rootCommand} dhcp-status`, description: 'Return DHCP server status' },
  {
    command: `${rootCommand} protection-toggle <on|off> [--confirm-toggle]`,
    description: 'Toggle global DNS protection',
    flags: [{ name: confirmToggleFlag, description: 'Confirm global protection change' }],
  },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after ADGUARD_URL, ADGUARD_USERNAME, and ADGUARD_PASSWORD are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
