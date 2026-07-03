import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  readonly appName?: string
  readonly version?: string
  readonly reachable?: boolean
  readonly errorCode?: string
}

export interface RootResult {
  readonly name: 'radarr'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'radarr'
export const existsCommandTemplate = `${rootCommand} exists <tmdb-id>`
export const qualityProfileFlag = '--quality-profile'
export const noSearchFlag = '--no-search'
export const deleteFilesFlag = '--delete-files'
export const confirmDeleteFilesFlag = '--confirm-delete-files'
export const confirmAddCollectionFlag = '--confirm-add-collection'
export const limitFlag = '--limit'
export const resultLimitFlag = '--result-limit'
export const daysFlag = '--days'
export const qualityProfileFlagTemplate = `${qualityProfileFlag} <quality-profile-id>`
export const addCommandTemplate = `${rootCommand} add <tmdb-id> [${qualityProfileFlagTemplate}] [${noSearchFlag}]`
export const addCollectionCommandTemplate = `${rootCommand} add-collection <collection-tmdb-id> [${noSearchFlag}] [${confirmAddCollectionFlag}]`
export const collectionInfoCommandTemplate = `${rootCommand} collection-info <collection-tmdb-id>`
export const removeKeepFilesCommandTemplate = `${rootCommand} remove <tmdb-id>`
export const queueLimitCommandTemplate = `${rootCommand} queue ${limitFlag} <n>`
export const calendarDaysCommandTemplate = `${rootCommand} calendar ${daysFlag} <n>`
export const missingLimitCommandTemplate = `${rootCommand} missing ${limitFlag} <n>`
export const historyLimitCommandTemplate = `${rootCommand} history ${limitFlag} <n>`

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after RADARR_URL and RADARR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
