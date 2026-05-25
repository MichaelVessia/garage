import type { CommandDescription, NextAction } from '@garage/cli-protocol'

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

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after SABNZBD_URL and SABNZBD_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
