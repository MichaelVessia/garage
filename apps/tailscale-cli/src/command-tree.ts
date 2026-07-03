import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: true
  readonly reachable: boolean
  readonly backendState?: string
  readonly peerCount?: number
  readonly exitNodeCount?: number
  readonly currentExitNode?: string
  readonly errorCode?: string
}

export interface RootResult {
  readonly name: 'tailscale'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'tailscale'
export const limitFlag = '--limit'

export const installNextAction: NextAction = {
  command: 'tailscale status --json',
  description: 'Install Tailscale on PATH and log in with tailscale up from an interactive shell',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
