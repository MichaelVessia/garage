import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultHistoryLimit, defaultLimit } from '@garage/sabnzbd'

export interface RootHealth {
  readonly configured: boolean
  readonly version?: string | undefined
  readonly paused?: boolean | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'sabnzbd'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'sabnzbd'
export const statusCommandTemplate = `${rootCommand} status`
export const versionCommandTemplate = `${rootCommand} version`
export const queueCommandTemplate = `${rootCommand} queue [--limit <n>]`
export const queueLimitCommandTemplate = `${rootCommand} queue --limit <n>`
export const historyCommandTemplate = `${rootCommand} history [--limit <n>]`
export const historyLimitCommandTemplate = `${rootCommand} history --limit <n>`
export const pauseCommandTemplate = `${rootCommand} pause`
export const resumeCommandTemplate = `${rootCommand} resume`
export const deleteCommandTemplate = `${rootCommand} delete <nzo-id> [--files] [--confirm-delete-files]`
export const deleteKeepFilesCommandTemplate = `${rootCommand} delete <nzo-id>`
export const serverStatsCommandTemplate = `${rootCommand} server-stats`
export const limitFlag = '--limit'
export const filesFlag = '--files'
export const confirmDeleteFilesFlag = '--confirm-delete-files'

export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: statusCommandTemplate, description: 'Return the SABnzbd full status summary' },
  { command: versionCommandTemplate, description: 'Return the SABnzbd version' },
  {
    command: queueCommandTemplate,
    description: 'Return active download queue records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum queue slots to return', default: defaultLimit }],
  },
  {
    command: historyCommandTemplate,
    description: 'Return recent download history records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum history slots to return', default: defaultHistoryLimit }],
  },
  { command: pauseCommandTemplate, description: 'Pause the SABnzbd queue' },
  { command: resumeCommandTemplate, description: 'Resume the SABnzbd queue' },
  {
    command: deleteCommandTemplate,
    description: 'Delete a queue item',
    flags: [
      { name: filesFlag, description: 'Delete downloaded files too' },
      { name: confirmDeleteFilesFlag, description: 'Confirm deletion of downloaded files from disk' },
    ],
  },
  { command: serverStatsCommandTemplate, description: 'Return download totals by day, week, month, and server' },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after SABNZBD_URL and SABNZBD_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
