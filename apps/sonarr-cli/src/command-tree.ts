import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  readonly appName?: string | undefined
  readonly version?: string | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'sonarr'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'sonarr'
export const statusCommandTemplate = `${rootCommand} status`
export const configCommandTemplate = `${rootCommand} config`
export const searchCommandTemplate = `${rootCommand} search <query>`
export const existsCommandTemplate = `${rootCommand} exists <tvdb-id>`
export const qualityProfileFlag = '--quality-profile'
export const noSearchFlag = '--no-search'
export const deleteFilesFlag = '--delete-files'
export const confirmDeleteFilesFlag = '--confirm-delete-files'
export const limitFlag = '--limit'
export const daysFlag = '--days'
export const qualityProfileFlagTemplate = `${qualityProfileFlag} <quality-profile-id>`
export const addCommandTemplate = `${rootCommand} add <tvdb-id> [${qualityProfileFlagTemplate}] [${noSearchFlag}]`
export const removeKeepFilesCommandTemplate = `${rootCommand} remove <tvdb-id>`
export const queueLimitCommandTemplate = `${rootCommand} queue ${limitFlag} <n>`
export const calendarDaysCommandTemplate = `${rootCommand} calendar ${daysFlag} <n>`
export const missingLimitCommandTemplate = `${rootCommand} missing ${limitFlag} <n>`
export const historyLimitCommandTemplate = `${rootCommand} history ${limitFlag} <n>`

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after SONARR_URL and SONARR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
