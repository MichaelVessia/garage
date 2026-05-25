import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: true
  readonly reachable: boolean
  readonly backendState?: string | undefined
  readonly peerCount?: number | undefined
  readonly exitNodeCount?: number | undefined
  readonly currentExitNode?: string | undefined
  readonly errorCode?: string | undefined
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
