import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  readonly reachable?: boolean | undefined
  readonly routeServers?: number | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'caddy'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'caddy'
export const confirmReloadFlag = '--confirm-reload'
export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: `${rootCommand} config`, description: 'Return full active Caddy config' },
  { command: `${rootCommand} routes`, description: 'Return route matchers and reverse-proxy upstreams' },
  { command: `${rootCommand} upstreams`, description: 'Return live reverse-proxy upstream health' },
  { command: `${rootCommand} pki-ca`, description: 'Return local internal CA info' },
  {
    command: `${rootCommand} reload <config.json> [--confirm-reload]`,
    description: 'Replace the active config via POST /load',
    flags: [{ name: confirmReloadFlag, description: 'Confirm full Caddy config replacement' }],
  },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after CADDY_URL is exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
