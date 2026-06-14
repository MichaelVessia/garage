import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized CLI envelope output; omitted JSON keys, not Option wrappers, are the agent-facing contract (asserted in commands.test.ts).
  readonly version?: string | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized CLI envelope output; omitted JSON keys, not Option wrappers, are the agent-facing contract (asserted in commands.test.ts).
  readonly reachable?: boolean | undefined
  // oxlint-disable-next-line effect/prefer-option-over-null -- serialized CLI envelope output; omitted JSON keys, not Option wrappers, are the agent-facing contract (asserted in commands.test.ts).
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'jellyseerr'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'jellyseerr'
export const statusCommandTemplate = `${rootCommand} status`
export const requestsCommandTemplate = `${rootCommand} requests [--all] [--limit <n>]`
export const requestCountsCommandTemplate = `${rootCommand} request-counts`
export const searchCommandTemplate = `${rootCommand} search <query> [--limit <n>]`
export const mediaStatusCommandTemplate = `${rootCommand} media-status <media-id>`
export const recentlyAddedCommandTemplate = `${rootCommand} recently-added [--limit <n>]`
export const approveCommandTemplate = `${rootCommand} approve <request-id> [--confirm-approve]`
export const approveConfirmedCommandTemplate = `${rootCommand} approve <request-id> --confirm-approve`
export const declineCommandTemplate = `${rootCommand} decline <request-id> [--confirm-decline]`
export const declineConfirmedCommandTemplate = `${rootCommand} decline <request-id> --confirm-decline`
export const deleteRequestCommandTemplate = `${rootCommand} delete-request <request-id> [--confirm-delete-request]`
export const deleteRequestConfirmedCommandTemplate = `${rootCommand} delete-request <request-id> --confirm-delete-request`
export const usersCommandTemplate = `${rootCommand} users [--limit <n>]`
export const issuesCommandTemplate = `${rootCommand} issues [--limit <n>]`
export const limitFlag = '--limit'
export const allFlag = '--all'
export const confirmApproveFlag = '--confirm-approve'
export const confirmDeclineFlag = '--confirm-decline'
export const confirmDeleteRequestFlag = '--confirm-delete-request'

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after JELLYSEERR_URL and JELLYSEERR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
