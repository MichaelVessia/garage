import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultLimit } from '@garage/jellyseerr'

export interface RootHealth {
  readonly configured: boolean
  readonly version?: string | undefined
  readonly reachable?: boolean | undefined
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

export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: statusCommandTemplate, description: 'Return Jellyseerr status' },
  {
    command: requestsCommandTemplate,
    description: 'Return pending media requests by default',
    flags: [
      { name: allFlag, description: 'Include all request states' },
      { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
    ],
  },
  { command: requestCountsCommandTemplate, description: 'Return request totals by state' },
  {
    command: searchCommandTemplate,
    description: 'Search TMDB through Jellyseerr',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  { command: mediaStatusCommandTemplate, description: 'Return one Jellyseerr media row' },
  {
    command: recentlyAddedCommandTemplate,
    description: 'Return recently available media',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: approveCommandTemplate,
    description: 'Approve a media request',
    flags: [{ name: confirmApproveFlag, description: 'Confirm request approval' }],
  },
  {
    command: declineCommandTemplate,
    description: 'Decline a media request',
    flags: [{ name: confirmDeclineFlag, description: 'Confirm request decline' }],
  },
  {
    command: deleteRequestCommandTemplate,
    description: 'Delete a media request',
    flags: [{ name: confirmDeleteRequestFlag, description: 'Confirm request deletion' }],
  },
  {
    command: usersCommandTemplate,
    description: 'Return Jellyseerr users',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: issuesCommandTemplate,
    description: 'Return open Jellyseerr issues',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after JELLYSEERR_URL and JELLYSEERR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
