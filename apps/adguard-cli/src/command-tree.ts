import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  // oxlint-disable-next-line effect/prefer-option-over-null -- agent-facing JSON envelope: absent fields are omitted from output, not serialized as Option
  readonly version?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- agent-facing JSON envelope: absent fields are omitted from output, not serialized as Option
  readonly protectionEnabled?: boolean | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- agent-facing JSON envelope: absent fields are omitted from output, not serialized as Option
  readonly reachable?: boolean | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- agent-facing JSON envelope: absent fields are omitted from output, not serialized as Option
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

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after ADGUARD_URL, ADGUARD_USERNAME, and ADGUARD_PASSWORD are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
