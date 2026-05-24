import {
  clients,
  clientsActive,
  cliUsageError,
  confirmationRequired,
  defaultLimit,
  dhcpStatus,
  dnsConfig,
  filters,
  protectionToggle,
  queryLog,
  queryLogSearch,
  rules,
  searchLimit,
  stats,
  statsInfo,
  status,
  version,
} from '@garage/adguard'
import type {
  ActiveClient,
  AdguardApi,
  AdguardConfig,
  AdguardError,
  ClientsResult,
  DhcpStatus,
  FiltersResult,
  JsonObject,
  ListResult,
  ProtectionState,
  QueryLogEntry,
  Stats,
  StatsInfo,
  SystemStatus,
  VersionResult,
} from '@garage/adguard'
import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import { Effect } from 'effect'

import {
  commandTree,
  confirmToggleFlag,
  envNextAction,
  limitFlag,
  rootCommand,
  showCommandsAction,
} from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type AdguardCliResult =
  | RootResult
  | SystemStatus
  | VersionResult
  | Stats
  | StatsInfo
  | ListResult<QueryLogEntry>
  | ClientsResult
  | ListResult<ActiveClient>
  | FiltersResult
  | ListResult<string>
  | JsonObject
  | DhcpStatus
  | ProtectionState

export type AdguardCliEnvelope = SuccessEnvelope<AdguardCliResult> | ErrorEnvelope

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
  readonly booleans: ReadonlySet<string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const errorToEnvelope = (command: string, error: AdguardError, nextActions: ReadonlyArray<NextAction>): ErrorEnvelope =>
  errorEnvelope({ command, error: { code: error.code, message: error.message }, fix: error.fix, nextActions })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, AdguardError, AdguardApi | AdguardConfig>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, AdguardApi | AdguardConfig> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]), onSuccess: (x) => x })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, AdguardError> => {
  if (value === undefined) {
    return Effect.fail(cliUsageError(`${label} is required`))
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0
    ? Effect.succeed(parsed)
    : Effect.fail(cliUsageError(`${label} must be a positive integer`))
}

const parseFlags = (
  tokens: ReadonlyArray<string>,
  valueFlags: ReadonlyArray<string>,
  booleanFlags: ReadonlyArray<string>
): Effect.Effect<ParsedFlags, AdguardError> => {
  const positionals: Array<string> = []
  const values = new Map<string, string>()
  const booleans = new Set<string>()
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === undefined) {
      index += 1
    } else if (valueFlags.includes(token)) {
      const value = tokens[index + 1]
      if (value === undefined || value.startsWith('-')) {
        return Effect.fail(cliUsageError(`${token} requires a value`))
      }
      values.set(token, value)
      index += 2
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
  return Effect.succeed({ positionals, values, booleans })
}

const recoverEnvelope = (
  command: string,
  program: Effect.Effect<AdguardCliEnvelope, AdguardError, AdguardApi | AdguardConfig>
): Effect.Effect<AdguardCliEnvelope, never, AdguardApi | AdguardConfig> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error, [showCommandsAction]),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, AdguardApi | AdguardConfig> =>
  status.pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'adguard',
            description: 'Agent-first AdGuard Home CLI',
            commands: commandTree,
            health:
              error.code === 'ADGUARD_ENV_MISSING'
                ? { configured: false }
                : { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: error.code === 'ADGUARD_ENV_MISSING' ? [envNextAction] : [showCommandsAction],
        }),
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'adguard',
            description: 'Agent-first AdGuard Home CLI',
            commands: commandTree,
            health: {
              configured: true,
              version: result.version,
              protectionEnabled: result.protectionEnabled,
            },
          },
        }),
    })
  )

const limitFromArgs = (args: ReadonlyArray<string>, fallback: number) =>
  parseFlags(args, [limitFlag], []).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(limitFlag)
      return value === undefined ? Effect.succeed(fallback) : parseInteger(value, 'limit')
    })
  )

const limitCommand = <Result extends AdguardCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  fallback: number,
  program: (limit: number) => Effect.Effect<Result, AdguardError, AdguardApi | AdguardConfig>
) =>
  recoverEnvelope(command, limitFromArgs(args, fallback).pipe(Effect.flatMap((limit) => wrap(command, program(limit)))))

const searchCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [limitFlag], [])
      const query = parsed.positionals.join(' ').trim()
      if (query.length === 0) {
        return yield* wrap(command, Effect.fail(cliUsageError('query is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? searchLimit : yield* parseInteger(value, 'limit')
      return yield* wrap(command, queryLogSearch({ query, limit }))
    })
  )

const clientsActiveCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [], [])
      const [ip] = parsed.positionals
      if (ip === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError('ip is required')))
      }
      return yield* wrap(command, clientsActive({ ip }))
    })
  )

const protectionToggleCommand = (command: string, rest: ReadonlyArray<string>) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [], [confirmToggleFlag])
      const [state] = parsed.positionals
      if (state !== 'on' && state !== 'off') {
        return yield* wrap(command, Effect.fail(cliUsageError('protection-toggle takes on or off')))
      }
      if (!parsed.booleans.has(confirmToggleFlag)) {
        return errorToEnvelope(command, confirmationRequired(), [
          {
            command: `${rootCommand} protection-toggle ${state} ${confirmToggleFlag}`,
            description: 'Toggle global DNS protection after user confirmation',
          },
        ])
      }
      return yield* wrap(command, protectionToggle({ state }))
    })
  )

const dispatch = (
  args: ReadonlyArray<string>
): Effect.Effect<AdguardCliEnvelope, never, AdguardApi | AdguardConfig> => {
  const command = commandString(args)
  const [name] = args
  const rest = args.slice(1)
  switch (name) {
    case undefined: {
      return root(command)
    }
    case 'status': {
      return wrap(command, status)
    }
    case 'version': {
      return wrap(command, version)
    }
    case 'stats': {
      return wrap(command, stats)
    }
    case 'stats-info': {
      return wrap(command, statsInfo)
    }
    case 'query-log': {
      return limitCommand(command, rest, defaultLimit, (limit) => queryLog({ limit }))
    }
    case 'query-log-search': {
      return searchCommand(command, rest)
    }
    case 'clients': {
      return wrap(command, clients)
    }
    case 'clients-active': {
      return clientsActiveCommand(command, rest)
    }
    case 'filters': {
      return wrap(command, filters)
    }
    case 'rules': {
      return wrap(command, rules)
    }
    case 'dns-config': {
      return wrap(command, dnsConfig)
    }
    case 'dhcp-status': {
      return wrap(command, dhcpStatus)
    }
    case 'protection-toggle': {
      return protectionToggleCommand(command, rest)
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeAdguard = (
  args: ReadonlyArray<string>
): Effect.Effect<AdguardCliEnvelope, never, AdguardApi | AdguardConfig> => dispatch(args)
