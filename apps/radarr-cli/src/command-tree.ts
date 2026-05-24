import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultAddCollectionResultLimit, defaultCalendarDays, defaultLimit } from '@garage/radarr'

export interface RootHealth {
  readonly configured: boolean
  readonly appName?: string | undefined
  readonly version?: string | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'radarr'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'radarr'
export const statusCommandTemplate = `${rootCommand} status`
export const configCommandTemplate = `${rootCommand} config`
export const searchCommandTemplate = `${rootCommand} search <query>`
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
export const removeCommandTemplate = `${rootCommand} remove <tmdb-id> [${deleteFilesFlag}] [${confirmDeleteFilesFlag}]`
export const removeKeepFilesCommandTemplate = `${rootCommand} remove <tmdb-id>`
export const queueCommandTemplate = `${rootCommand} queue [${limitFlag} <n>]`
export const queueLimitCommandTemplate = `${rootCommand} queue ${limitFlag} <n>`
export const calendarCommandTemplate = `${rootCommand} calendar [${daysFlag} <n>]`
export const calendarDaysCommandTemplate = `${rootCommand} calendar ${daysFlag} <n>`
export const missingCommandTemplate = `${rootCommand} missing [${limitFlag} <n>]`
export const missingLimitCommandTemplate = `${rootCommand} missing ${limitFlag} <n>`
export const historyCommandTemplate = `${rootCommand} history [${limitFlag} <n>]`
export const historyLimitCommandTemplate = `${rootCommand} history ${limitFlag} <n>`

export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: statusCommandTemplate, description: 'Return the Radarr system status summary' },
  { command: configCommandTemplate, description: 'Return root folders and quality profiles' },
  {
    command: searchCommandTemplate,
    description: 'Search Radarr lookup by movie title',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  { command: existsCommandTemplate, description: 'Check whether a TMDB ID is already in the library' },
  {
    command: addCommandTemplate,
    description: 'Add a movie by TMDB ID',
    flags: [
      { name: qualityProfileFlagTemplate, description: 'Override the default Radarr quality profile' },
      { name: noSearchFlag, description: 'Add without searching for the movie' },
    ],
  },
  {
    command: addCollectionCommandTemplate,
    description: 'Add movies from a known Radarr collection',
    flags: [
      { name: noSearchFlag, description: 'Add movies without searching' },
      { name: confirmAddCollectionFlag, description: 'Confirm the collection add' },
      {
        name: `${resultLimitFlag} <n>`,
        description: 'Maximum result records to include in the envelope',
        default: defaultAddCollectionResultLimit,
      },
    ],
  },
  { command: collectionInfoCommandTemplate, description: 'Inspect a known Radarr collection by TMDB ID' },
  {
    command: removeCommandTemplate,
    description: 'Remove a movie by TMDB ID',
    flags: [
      { name: deleteFilesFlag, description: 'Request media file deletion' },
      { name: confirmDeleteFilesFlag, description: 'Confirm media file deletion' },
    ],
  },
  {
    command: queueCommandTemplate,
    description: 'Return active queue records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: calendarCommandTemplate,
    description: 'Return upcoming movies',
    flags: [{ name: `${daysFlag} <n>`, description: 'Number of days to include', default: defaultCalendarDays }],
  },
  {
    command: missingCommandTemplate,
    description: 'Return monitored missing movies',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: historyCommandTemplate,
    description: 'Return recent history records',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after RADARR_URL and RADARR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
