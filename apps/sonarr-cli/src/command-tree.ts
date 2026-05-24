import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultCalendarDays, defaultLimit } from '@garage/sonarr'

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
export const removeCommandTemplate = `${rootCommand} remove <tvdb-id> [${deleteFilesFlag}] [${confirmDeleteFilesFlag}]`
export const removeKeepFilesCommandTemplate = `${rootCommand} remove <tvdb-id>`
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
  { command: statusCommandTemplate, description: 'Return the Sonarr system status summary' },
  { command: configCommandTemplate, description: 'Return root folders and quality profiles' },
  { command: searchCommandTemplate, description: 'Search Sonarr lookup by series title' },
  { command: existsCommandTemplate, description: 'Check whether a TVDB ID is already in the library' },
  {
    command: addCommandTemplate,
    description: 'Add a series by TVDB ID',
    flags: [
      { name: qualityProfileFlagTemplate, description: 'Override the default Sonarr quality profile' },
      { name: noSearchFlag, description: 'Add without searching for missing episodes' },
    ],
  },
  {
    command: removeCommandTemplate,
    description: 'Remove a series by TVDB ID',
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
    description: 'Return upcoming episodes',
    flags: [{ name: `${daysFlag} <n>`, description: 'Number of days to include', default: defaultCalendarDays }],
  },
  {
    command: missingCommandTemplate,
    description: 'Return monitored missing episodes',
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
  description: 'Open a fresh shell after SONARR_URL and SONARR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
