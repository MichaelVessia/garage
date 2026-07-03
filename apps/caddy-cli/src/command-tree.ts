import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  // oxlint-disable-next-line effect/prefer-option-over-null -- agent-facing JSON envelope: absent fields are omitted from output, not serialized as Option
  readonly reachable?: boolean | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- agent-facing JSON envelope: absent fields are omitted from output, not serialized as Option
  readonly routeServers?: number | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- agent-facing JSON envelope: absent fields are omitted from output, not serialized as Option
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
