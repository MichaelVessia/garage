import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized CLI envelope output; omitted JSON keys, not Option wrappers, are the agent-facing contract (asserted in commands.test.ts).
  readonly version?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized CLI envelope output; omitted JSON keys, not Option wrappers, are the agent-facing contract (asserted in commands.test.ts).
  readonly serverName?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized CLI envelope output; omitted JSON keys, not Option wrappers, are the agent-facing contract (asserted in commands.test.ts).
  readonly reachable?: boolean | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized CLI envelope output; omitted JSON keys, not Option wrappers, are the agent-facing contract (asserted in commands.test.ts).
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'jellyfin'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'jellyfin'
export const limitFlag = '--limit'
export const confirmRunTaskFlag = '--confirm-run-task'

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after JELLYFIN_URL and JELLYFIN_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
