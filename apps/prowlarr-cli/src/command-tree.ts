import type { CommandDescription, NextAction } from '@garage/cli-protocol'
import { defaultHistoryLimit, defaultLimit } from '@garage/prowlarr'

export interface RootHealth {
  readonly configured: boolean
  readonly appName?: string | undefined
  readonly version?: string | undefined
  readonly reachable?: boolean | undefined
  readonly errorCode?: string | undefined
}

export interface RootResult {
  readonly name: 'prowlarr'
  readonly description: string
  readonly commands: ReadonlyArray<CommandDescription>
  readonly health: RootHealth
}

export const rootCommand = 'prowlarr'
export const statusCommandTemplate = `${rootCommand} status`
export const healthCommandTemplate = `${rootCommand} health [--limit <n>]`
export const indexersCommandTemplate = `${rootCommand} indexers [--limit <n>]`
export const indexerStatsCommandTemplate = `${rootCommand} indexer-stats [--limit <n>]`
export const searchCommandTemplate = `${rootCommand} search <query>`
export const tvSearchCommandTemplate = `${rootCommand} tv-search --tvdb <id> [--season <n>] [--episode <n>]`
export const movieSearchCommandTemplate = `${rootCommand} movie-search --imdb <id> | --tmdb <id>`
export const testCommandTemplate = `${rootCommand} test <indexer-id>`
export const appsCommandTemplate = `${rootCommand} apps [--limit <n>]`
export const syncCommandTemplate = `${rootCommand} sync [--confirm-sync]`
export const syncConfirmedCommandTemplate = `${rootCommand} sync --confirm-sync`
export const historyCommandTemplate = `${rootCommand} history [--limit <n>]`
export const historyLimitCommandTemplate = `${rootCommand} history --limit <n>`
export const limitFlag = '--limit'
export const torrentsFlag = '--torrents'
export const usenetFlag = '--usenet'
export const categoryFlag = '--category'
export const categoryShortFlag = '-c'
export const typeFlag = '--type'
export const tvdbFlag = '--tvdb'
export const seasonFlag = '--season'
export const seasonShortFlag = '-s'
export const episodeFlag = '--episode'
export const episodeShortFlag = '-e'
export const imdbFlag = '--imdb'
export const tmdbFlag = '--tmdb'
export const confirmSyncFlag = '--confirm-sync'

export const commandTree: ReadonlyArray<CommandDescription> = [
  { command: rootCommand, description: 'Show this command tree and configuration health' },
  { command: statusCommandTemplate, description: 'Return the Prowlarr system status summary' },
  {
    command: healthCommandTemplate,
    description: 'Return active Prowlarr health warnings',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: indexersCommandTemplate,
    description: 'Return configured indexers',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: indexerStatsCommandTemplate,
    description: 'Return per-indexer query, grab, and failure counts',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: searchCommandTemplate,
    description: 'Search enabled indexers by free text',
    flags: [
      { name: torrentsFlag, description: 'Search torrent indexers only' },
      { name: usenetFlag, description: 'Search usenet indexers only' },
      { name: `${categoryFlag} <id>`, description: 'Restrict by Newznab category ID' },
      { name: `${typeFlag} <type>`, description: 'Override Prowlarr search type', default: 'search' },
      { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
    ],
  },
  {
    command: tvSearchCommandTemplate,
    description: 'Search TV releases by TVDB ID',
    flags: [
      { name: `${tvdbFlag} <id>`, description: 'TVDB series ID' },
      { name: `${seasonFlag} <n>`, description: 'Season number' },
      { name: `${episodeFlag} <n>`, description: 'Episode number' },
      { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
    ],
  },
  {
    command: movieSearchCommandTemplate,
    description: 'Search movie releases by IMDB or TMDB ID',
    flags: [
      { name: `${imdbFlag} <id>`, description: 'IMDB title ID' },
      { name: `${tmdbFlag} <id>`, description: 'TMDB movie ID' },
      { name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit },
    ],
  },
  { command: testCommandTemplate, description: 'Test one indexer configuration' },
  {
    command: appsCommandTemplate,
    description: 'Return connected applications',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
  },
  {
    command: syncCommandTemplate,
    description: 'Push indexer config to all connected applications',
    flags: [{ name: confirmSyncFlag, description: 'Confirm application indexer sync' }],
  },
  {
    command: historyCommandTemplate,
    description: 'Return recent indexer history',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultHistoryLimit }],
  },
]

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after PROWLARR_URL and PROWLARR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
