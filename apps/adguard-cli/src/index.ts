import {
  clients,
  clientsActive,
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
import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import * as Effect from 'effect/Effect'
import * as Str from 'effect/String'

import { confirmToggleFlag, envNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
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
type AdguardCliError = AdguardError | CliUsageError
type AdguardCliContext = AdguardApi | AdguardConfig
type AdguardInvocation = CommandInvocation<AdguardCliResult, AdguardCliError, AdguardCliContext>

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, AdguardCliContext> =>
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

const limitCommand = <Result extends AdguardCliResult>(
  { args, limitFromArgs, recover, wrap }: AdguardInvocation,
  fallback: number,
  program: (limit: number) => Effect.Effect<Result, AdguardError, AdguardApi | AdguardConfig>
) => recover(limitFromArgs(args, limitFlag, fallback).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const searchCommand = ({ args, parseFlags, parsePositiveInteger, recover, usageError, wrap }: AdguardInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { valueFlags: [limitFlag] })
      const query = parsed.positionals.join(' ').trim()
      if (Str.isEmpty(query)) {
        return yield* wrap(Effect.fail(usageError('query is required')))
      }
      const value = parsed.values.get(limitFlag)
      const limit = value === undefined ? searchLimit : yield* parsePositiveInteger(value, 'limit')
      return yield* wrap(queryLogSearch({ query, limit }))
    })
  )

const clientsActiveCommand = ({ args, parseFlags, recover, usageError, wrap }: AdguardInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args)
      const [ip] = parsed.positionals
      if (ip === undefined) {
        return yield* wrap(Effect.fail(usageError('ip is required')))
      }
      return yield* wrap(clientsActive({ ip }))
    })
  )

const protectionToggleCommand = ({ args, errorToEnvelope, parseFlags, recover, usageError, wrap }: AdguardInvocation) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args, { booleanFlags: [confirmToggleFlag] })
      const [state] = parsed.positionals
      if (state !== 'on' && state !== 'off') {
        return yield* wrap(Effect.fail(usageError('protection-toggle takes on or off')))
      }
      if (!parsed.booleans.has(confirmToggleFlag)) {
        return errorToEnvelope(confirmationRequired(), [
          {
            command: `${rootCommand} protection-toggle ${state} ${confirmToggleFlag}`,
            description: 'Toggle global DNS protection after user confirmation',
          },
        ])
      }
      return yield* wrap(protectionToggle({ state }))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and configuration health' }

const commandDefinitions: ReadonlyArray<CommandDefinition<AdguardCliResult, AdguardCliError, AdguardCliContext>> = [
  {
    name: 'status',
    command: `${rootCommand} status`,
    description: 'Return AdGuard Home status',
    handle: ({ wrap }) => wrap(status),
  },
  {
    name: 'version',
    command: `${rootCommand} version`,
    description: 'Return AdGuard Home version',
    handle: ({ wrap }) => wrap(version),
  },
  {
    name: 'stats',
    command: `${rootCommand} stats`,
    description: 'Return DNS counters and top domains or clients',
    handle: ({ wrap }) => wrap(stats),
  },
  {
    name: 'stats-info',
    command: `${rootCommand} stats-info`,
    description: 'Return stats retention interval',
    handle: ({ wrap }) => wrap(statsInfo),
  },
  {
    name: 'query-log',
    command: `${rootCommand} query-log [${limitFlag} <n>]`,
    description: 'Return recent DNS queries',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, defaultLimit, (limit) => queryLog({ limit })),
  },
  {
    name: 'query-log-search',
    command: `${rootCommand} query-log-search <query> [${limitFlag} <n>]`,
    description: 'Search recent DNS queries',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum records to return', default: searchLimit }],
    handle: searchCommand,
  },
  {
    name: 'clients',
    command: `${rootCommand} clients`,
    description: 'Return configured and auto-detected clients',
    handle: ({ wrap }) => wrap(clients),
  },
  {
    name: 'clients-active',
    command: `${rootCommand} clients-active <ip>`,
    description: 'Lookup one active client by IP',
    handle: clientsActiveCommand,
  },
  {
    name: 'filters',
    command: `${rootCommand} filters`,
    description: 'Return blocklists, allowlists, and custom rule count',
    handle: ({ wrap }) => wrap(filters),
  },
  {
    name: 'rules',
    command: `${rootCommand} rules`,
    description: 'Return custom user rules',
    handle: ({ wrap }) => wrap(rules),
  },
  {
    name: 'dns-config',
    command: `${rootCommand} dns-config`,
    description: 'Return full DNS server config',
    handle: ({ wrap }) => wrap(dnsConfig),
  },
  {
    name: 'dhcp-status',
    command: `${rootCommand} dhcp-status`,
    description: 'Return DHCP server status',
    handle: ({ wrap }) => wrap(dhcpStatus),
  },
  {
    name: 'protection-toggle',
    command: `${rootCommand} protection-toggle <on|off> [${confirmToggleFlag}]`,
    description: 'Toggle global DNS protection',
    flags: [{ name: confirmToggleFlag, description: 'Confirm global protection change' }],
    handle: protectionToggleCommand,
  },
]

const execute = createCliRunner<AdguardCliResult, AdguardCliError, AdguardCliContext>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: () => [showCommandsAction],
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeAdguard = (
  args: ReadonlyArray<string>
): Effect.Effect<AdguardCliEnvelope, never, AdguardCliContext> => execute(args)
