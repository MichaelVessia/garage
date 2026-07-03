import type { CommandDescription, NextAction } from '@garage/cli-protocol'

export interface RootHealth {
  readonly configured: boolean
  readonly appName?: string
  readonly version?: string
  readonly reachable?: boolean
  readonly errorCode?: string
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
export const appsCommandTemplate = `${rootCommand} apps [--limit <n>]`
export const syncConfirmedCommandTemplate = `${rootCommand} sync --confirm-sync`
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

export const envNextAction: NextAction = {
  command: rootCommand,
  description: 'Open a fresh shell after PROWLARR_URL and PROWLARR_API_KEY are exported',
}

export const showCommandsAction: NextAction = { command: rootCommand, description: 'Show available commands' }
