import { createCliRunner, createCliUsageError, successEnvelope } from '@garage/cli-protocol'
import type {
  CliUsageError,
  CommandDefinition,
  CommandInvocation,
  ErrorEnvelope,
  NextAction,
  SuccessEnvelope,
} from '@garage/cli-protocol'
import { currentExitNode, defaultLimit, dns, exitNodes, ip, peers, ping, status, whois } from '@garage/tailscale'
import type {
  CurrentExitNodeResult,
  DnsResult,
  IpResult,
  JsonObject,
  ListResult,
  PeerRecord,
  PingResult,
  StatusResult,
  TailscaleApi,
  TailscaleError,
} from '@garage/tailscale'
import * as Effect from 'effect/Effect'

import { installNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
import type { RootResult } from './command-tree.js'

export type TailscaleCliResult =
  | RootResult
  | StatusResult
  | ListResult<PeerRecord>
  | CurrentExitNodeResult
  | DnsResult
  | IpResult
  | JsonObject
  | PingResult

export type TailscaleCliEnvelope = SuccessEnvelope<TailscaleCliResult> | ErrorEnvelope
type TailscaleCliError = TailscaleError | CliUsageError
type TailscaleInvocation = CommandInvocation<TailscaleCliResult, TailscaleCliError, TailscaleApi>

const nextActionsFor = (error: TailscaleCliError): ReadonlyArray<NextAction> =>
  error.code === 'TAILSCALE_CLI_MISSING' ? [installNextAction] : [showCommandsAction]

const root = (
  command: string,
  commandTree: RootResult['commands']
): Effect.Effect<SuccessEnvelope<RootResult>, never, TailscaleApi> =>
  status().pipe(
    Effect.match({
      onFailure: (error) =>
        successEnvelope({
          command,
          result: {
            name: 'tailscale',
            description: 'Agent-first Tailscale CLI',
            commands: commandTree,
            health: { configured: true, reachable: false, errorCode: error.code },
          },
          nextActions: nextActionsFor(error),
        }),
      onSuccess: (result) => {
        const exitNodeName = result.currentExitNode?.hostName ?? result.currentExitNode?.dnsName
        return successEnvelope({
          command,
          result: {
            name: 'tailscale',
            description: 'Agent-first Tailscale CLI',
            commands: commandTree,
            health: {
              configured: true,
              reachable: result.backendState === 'Running',
              peerCount: result.peerCount,
              exitNodeCount: result.exitNodeCount,
              ...(result.backendState === undefined ? {} : { backendState: result.backendState }),
              ...(exitNodeName === undefined ? {} : { currentExitNode: exitNodeName }),
            },
          },
        })
      },
    })
  )

const limitCommand = <Result extends TailscaleCliResult>(
  { args, limitFromArgs, recover, wrap }: TailscaleInvocation,
  program: (limit: number) => Effect.Effect<Result, TailscaleError, TailscaleApi>
) => recover(limitFromArgs(args, limitFlag, defaultLimit).pipe(Effect.flatMap((limit) => wrap(program(limit)))))

const targetCommand = <Result extends TailscaleCliResult>(
  { args, parseFlags, recover, usageError, wrap }: TailscaleInvocation,
  label: string,
  program: (target: string) => Effect.Effect<Result, TailscaleError, TailscaleApi>
) =>
  recover(
    Effect.gen(function* () {
      const parsed = yield* parseFlags(args)
      const [target] = parsed.positionals
      if (target === undefined) {
        return yield* wrap(Effect.fail(usageError(`${label} is required`)))
      }
      return yield* wrap(program(target))
    })
  )

const rootDescription = { command: rootCommand, description: 'Show this command tree and local daemon health' }

const commandDefinitions: ReadonlyArray<CommandDefinition<TailscaleCliResult, TailscaleCliError, TailscaleApi>> = [
  {
    name: 'status',
    command: `${rootCommand} status [${limitFlag} <n>]`,
    description: 'Return local tailnet state and a bounded peer sample',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum peers to include', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => status({ limit })),
  },
  {
    name: 'peers',
    command: `${rootCommand} peers [${limitFlag} <n>]`,
    description: 'Return peers from tailscale status',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum peers to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => peers({ limit })),
  },
  {
    name: 'exit-nodes',
    command: `${rootCommand} exit-nodes [${limitFlag} <n>]`,
    description: 'Return peers advertising exit-node service',
    flags: [{ name: `${limitFlag} <n>`, description: 'Maximum exit nodes to return', default: defaultLimit }],
    handle: (invocation) => limitCommand(invocation, (limit) => exitNodes({ limit })),
  },
  {
    name: 'current-exit-node',
    command: `${rootCommand} current-exit-node`,
    description: 'Return the exit node currently in use, if any',
    handle: ({ wrap }) => wrap(currentExitNode),
  },
  {
    name: 'dns',
    command: `${rootCommand} dns`,
    description: 'Return tailscale dns status output',
    handle: ({ wrap }) => wrap(dns),
  },
  {
    name: 'ip',
    command: `${rootCommand} ip`,
    description: 'Return this machine tailnet IPv4 and IPv6 addresses',
    handle: ({ wrap }) => wrap(ip),
  },
  {
    name: 'whois',
    command: `${rootCommand} whois <ip-or-host>`,
    description: 'Return tailscale whois --json for a target',
    handle: (invocation) => targetCommand(invocation, 'ip or host', (target) => whois({ target })),
  },
  {
    name: 'ping',
    command: `${rootCommand} ping <host>`,
    description: 'Run tailscale ping --c 3 for a target',
    handle: (invocation) => targetCommand(invocation, 'host', (target) => ping({ target })),
  },
]

const execute = createCliRunner<TailscaleCliResult, TailscaleCliError, TailscaleApi>({
  rootCommand,
  rootDescription,
  commands: commandDefinitions,
  usageError: createCliUsageError(rootCommand),
  fallbackNextActions: nextActionsFor,
  root: ({ command, commandTree }) => root(command, commandTree),
})

export const executeTailscale = (
  args: ReadonlyArray<string>
): Effect.Effect<TailscaleCliEnvelope, never, TailscaleApi> => execute(args)
