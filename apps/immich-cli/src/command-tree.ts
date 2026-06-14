import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized JSON envelope field; optional keys are omitted on the wire, and Option would render as `{ _tag, value }`, breaking the agent-facing output contract.
  readonly version?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized JSON envelope field; optional keys are omitted on the wire, and Option would render as `{ _tag, value }`, breaking the agent-facing output contract.
  readonly ping?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized JSON envelope field; optional keys are omitted on the wire, and Option would render as `{ _tag, value }`, breaking the agent-facing output contract.
  readonly reachable?: boolean | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized JSON envelope field; optional keys are omitted on the wire, and Option would render as `{ _tag, value }`, breaking the agent-facing output contract.
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

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after IMMICH_URL and IMMICH_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
