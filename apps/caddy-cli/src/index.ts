import { config, confirmationRequired, pkiCa, reload, routes, upstreams } from '@garage/caddy'
import type {
  CaddyApi,
  CaddyError,
  JsonObject,
  ListResult,
  PkiCa,
  ReloadResult,
  RouteSummary,
  UpstreamRecord,
} from '@garage/caddy'
import { createCliRunner, createCliUsageError, makeRoot } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'

import { confirmReloadFlag, envNextAction, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootResult } from './command-tree.js'
import { readCaddyConfigFile } from './config-file.js'

export type CaddyCliResult =
  | RootResult
  | JsonObject
  | ListResult<RouteSummary>
  | ListResult<UpstreamRecord>
  | PkiCa
  | ReloadResult

export type CaddyCliEnvelope = SuccessEnvelope<CaddyCliResult> | ErrorEnvelope
type CaddyCliError = CaddyError | CliUsageError
type CaddyCliContext = CaddyApi | FileSystem.FileSystem
type CaddyInvocation = CommandInvocation<CaddyCliResult, CaddyCliError, CaddyCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, CaddyCliContext> =>
  makeRoot({
    command,
    commandTree,
    name: 'caddy',
    description: 'Agent-first Caddy CLI',
    status: routes,
    envMissingCode: 'CADDY_ENV_MISSING',
    envNextAction,
    showCommandsAction,
    onReachable: (result) => ({ configured: true, reachable: true, routeServers: result.count }),
  })

const reloadCommand = ({ args, errorToEnvelope, parseFlags, recover, usageError, wrap }: CaddyInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [confirmReloadFlag] })
      const [path] = parsed.positionals
      if (path === undefined) {
        return yield* wrap(Effect.fail(usageError('config path is required')))
      }
      if (!parsed.booleans.has(confirmReloadFlag)) {
        return errorToEnvelope(confirmationRequired(), [
          {
            command: `${rootCommand} reload <config.json> ${confirmReloadFlag}`,
            description: 'Reload Caddy after user confirmation and config diff review',
            params: { 'config.json': { value: path, description: 'Path to adapted Caddy JSON config' } },
          },
        ])
      }
      const nextConfig = yield* readCaddyConfigFile(path)
      return yield* wrap(reload(nextConfig))
    })
  )

const commandDefinitions: ReadonlyArray<CommandDefinition<CaddyCliResult, CaddyCliError, CaddyCliContext>> = [
  {
    name: 'config',
    command: `${rootCommand} config`,
    description: 'Return full active Caddy config',
    handle: ({ wrap }) => wrap(config),
  },
  {
    name: 'routes',
    command: `${rootCommand} routes`,
    description: 'Return route matchers and reverse-proxy upstreams',
    handle: ({ wrap }) => wrap(routes),
  },
  {
    name: 'upstreams',
    command: `${rootCommand} upstreams`,
    description: 'Return live reverse-proxy upstream health',
    handle: ({ wrap }) => wrap(upstreams),
  },
  {
    name: 'pki-ca',
    command: `${rootCommand} pki-ca`,
    description: 'Return local internal CA info',
    handle: ({ wrap }) => wrap(pkiCa),
  },
  {
    name: 'reload',
    command: `${rootCommand} reload <config.json> [${confirmReloadFlag}]`,
    description: 'Replace the active config via POST /load',
    flags: [{ name: confirmReloadFlag, description: 'Confirm full Caddy config replacement' }],
    handle: reloadCommand,
  },
]

const execute = createCliRunner<CaddyCliResult, CaddyCliError, CaddyCliContext>({
  rootCommand,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeCaddy = (args: ReadonlyArray<string>): Effect.Effect<CaddyCliEnvelope, never, CaddyCliContext> =>
  execute(args)
