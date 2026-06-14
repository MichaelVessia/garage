import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export type RootHealth =
  | { readonly configured: false }
  | { readonly configured: true; readonly reachable: false; readonly errorCode: string }
  | { readonly configured: true; readonly reachable: true }
  | { readonly configured: true; readonly health: string }

export interface RootResult {
  readonly name: 'tubearchivist'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'tubearchivist'
export const limitFlag = '--limit'
export const confirmUnsubscribeFlag = '--confirm-unsubscribe'

export const envNextAction: NextAction = {
  command: rootCommand,
  description:
    'Open a fresh shell after TUBEARCHIVIST_URL, TUBEARCHIVIST_USERNAME, and TUBEARCHIVIST_PASSWORD are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
