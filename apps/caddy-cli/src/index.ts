import { cliUsageError, config, confirmationRequired, pkiCa, reload, routes, upstreams } from '@garage/caddy'
import type {
  CaddyApi,
  CaddyConfig,
  CaddyError,
  JsonObject,
  ListResult,
  PkiCa,
  ReloadResult,
  RouteSummary,
  UpstreamRecord,
} from '@garage/caddy'
import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import { Effect } from 'effect'

import { commandTree, confirmReloadFlag, envNextAction, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootResult } from './command-tree.js'
import { CaddyConfigFile } from './config-file.js'

export type CaddyCliResult =
  | RootResult
  | JsonObject
  | ListResult<RouteSummary>
  | ListResult<UpstreamRecord>
  | PkiCa
  | ReloadResult

export type CaddyCliEnvelope = SuccessEnvelope<CaddyCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly booleans: ReadonlySet<string>
}

type CaddyCliContext = CaddyApi | CaddyConfig | CaddyConfigFile

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (command: string, error: CaddyError, nextActions: ReadonlyArray<NextAction>): ErrorEnvelope =>
  errorEnvelope({ command, error: { code: error.code, message: error.message }, fix: error.fix, nextActions })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, CaddyError, CaddyApi | CaddyConfig>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, CaddyApi | CaddyConfig> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]), onSuccess: (x) => x })
  )

const parseFlags = (
  tokens: ReadonlyArray<string>,
  booleanFlags: ReadonlyArray<string>
): Effect.Effect<ParsedFlags, CaddyError> => {
  const positionals: Array<string> = []
  const booleans = new Set<string>()
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === undefined) {
      index += 1
    } else if (booleanFlags.includes(token)) {
      booleans.add(token)
      index += 1
    } else if (token.startsWith('-')) {
      return Effect.fail(cliUsageError(`Unknown flag ${token}`))
    } else {
      positionals.push(token)
      index += 1
    }
  }
  return Effect.succeed({ positionals, booleans })
}

const recoverEnvelope = (
  command: string,
  program: Effect.Effect<CaddyCliEnvelope, CaddyError, CaddyCliContext>
): Effect.Effect<CaddyCliEnvelope, never, CaddyCliContext> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, CaddyCliContext> =>
  routes.pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'caddy',
            description: 'Agent-first Caddy CLI',
            commands: commandTree,
            health:
              error.code === 'CADDY_ENV_MISSING'
                ? { configured: false }
                : { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: error.code === 'CADDY_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        }),
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'caddy',
            description: 'Agent-first Caddy CLI',
            commands: commandTree,
            health: { configured: true, reachable: true, routeServers: result.count },
          },
        }),
    })
  )

const reloadCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [confirmReloadFlag])
      const [path] = parsed.positionals
      if (path === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('config path is required')))
      }
      if (!parsed.booleans.has(confirmReloadFlag)) {
        return errorToEnvelope(command, confirmationRequired(), [
          {
            command: `${rootCommand} reload <config.json> ${confirmReloadFlag}`,
            description: 'Reload Caddy after user confirmation and config diff review',
            params: { 'config.json': { value: path, description: 'Path to adapted Caddy JSON config' } },
          },
        ])
      }
      const files = yield* CaddyConfigFile
      const nextConfig = yield* files.read(path)
      return yield* wrap(command, reload(nextConfig))
    })
  )

const dispatch = (args: ReadonlyArray<string>): Effect.Effect<CaddyCliEnvelope, never, CaddyCliContext> => {
  const command = commandString(args)
  const [name] = args
  const rest = args.slice(1)
  switch (name) {
    case undefined: {
      return root(command)
    }
    case 'config': {
      return wrap(command, config)
    }
    case 'routes': {
      return wrap(command, routes)
    }
    case 'upstreams': {
      return wrap(command, upstreams)
    }
    case 'pki-ca': {
      return wrap(command, pkiCa)
    }
    case 'reload': {
      return reloadCommand(command, rest)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeCaddy = (args: ReadonlyArray<string>): Effect.Effect<CaddyCliEnvelope, never, CaddyCliContext> =>
  dispatch(args)
