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

export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: 'sonarr', description: 'Show this command tree and configuration health' },
  { command: 'sonarr status', description: 'Return the Sonarr system status summary' },
  { command: 'sonarr config', description: 'Return root folders and quality profiles' },
  { command: 'sonarr search <query>', description: 'Search Sonarr lookup by series title' },
  { command: 'sonarr exists <tvdb-id>', description: 'Check whether a TVDB ID is already in the library' },
  {
    command: 'sonarr add <tvdb-id> [--quality-profile <quality-profile-id>] [--no-search]',
    description: 'Add a series by TVDB ID',
    flags: [
      { name: '--quality-profile <quality-profile-id>', description: 'Override the default Sonarr quality profile' },
      { name: '--no-search', description: 'Add without searching for missing episodes' },
    ],
  },
  {
    command: 'sonarr remove <tvdb-id> [--delete-files] [--confirm-delete-files]',
    description: 'Remove a series by TVDB ID',
    flags: [
      { name: '--delete-files', description: 'Request media file deletion' },
      { name: '--confirm-delete-files', description: 'Confirm media file deletion' },
    ],
  },
  {
    command: 'sonarr queue [--limit <n>]',
    description: 'Return active queue records',
    flags: [{ name: '--limit <n>', description: 'Maximum records to return', default: 10 }],
  },
  {
    command: 'sonarr calendar [--days <n>]',
    description: 'Return upcoming episodes',
    flags: [{ name: '--days <n>', description: 'Number of days to include', default: 14 }],
  },
  {
    command: 'sonarr missing [--limit <n>]',
    description: 'Return monitored missing episodes',
    flags: [{ name: '--limit <n>', description: 'Maximum records to return', default: 10 }],
  },
  {
    command: 'sonarr history [--limit <n>]',
    description: 'Return recent history records',
    flags: [{ name: '--limit <n>', description: 'Maximum records to return', default: 10 }],
  },
]

export const envNextAction: NextAction = {
  command: 'sonarr',
  description: 'Open a fresh shell after SONARR_URL and SONARR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: 'sonarr', description: 'Show available commands' }
