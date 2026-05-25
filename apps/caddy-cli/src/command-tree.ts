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

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after CADDY_URL is exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
