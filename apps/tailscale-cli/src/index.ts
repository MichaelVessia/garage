import { errorEnvelope, successEnvelope } from '@garage/cli-protocol'
import type { ErrorEnvelope, NextAction, SuccessEnvelope } from '@garage/cli-protocol'
import {
  cliUsageError,
  currentExitNode,
  defaultLimit,
  dns,
  exitNodes,
  ip,
  peers,
  ping,
  status,
  whois,
} from '@garage/tailscale'
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
import { Effect } from 'effect'

import { commandTree, installNextAction, limitFlag, rootCommand, showCommandsAction } from './command-tree.js'
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

interface ParsedFlags {
  readonly positionals: ReadonlyArray<string>
  readonly values: ReadonlyMap<string, string>
}

const commandString = (args: ReadonlyArray<string>): string =>
  args.length === 0 ? rootCommand : `${rootCommand} ${args.join(' ')}`

const nextActionsFor = (error: TailscaleError): ReadonlyArray<NextAction> =>
  error.code === 'TAILSCALE_CLI_MISSING' ? [installNextAction] : [showCommandsAction]

const errorToEnvelope = (command: string, error: TailscaleError): ErrorEnvelope =>
  errorEnvelope({
    command,
    error: { code: error.code, message: error.message },
    fix: error.fix,
    nextActions: nextActionsFor(error),
  })

const wrap = <Result>(
  command: string,
  program: Effect.Effect<Result, TailscaleError, TailscaleApi>
): Effect.Effect<SuccessEnvelope<Result> | ErrorEnvelope, never, TailscaleApi> =>
  program.pipe(
    Effect.map((result) => successEnvelope({ command, result })),
    Effect.match({ onFailure: (error) => errorToEnvelope(command, error), onSuccess: (x) => x })
  )

const parseInteger = (value: string | undefined, label: string): Effect.Effect<number, TailscaleError> => {
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
  valueFlags: ReadonlyArray<string>
): Effect.Effect<ParsedFlags, TailscaleError> => {
  const positionals: Array<string> = []
  const values = new Map<string, string>()
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
    } else if (token.startsWith('-')) {
      return Effect.fail(cliUsageError(`Unknown flag ${token}`))
    } else {
      positionals.push(token)
      index += 1
    }
  }
  return Effect.succeed({ positionals, values })
}

const recoverEnvelope = (
  command: string,
  program: Effect.Effect<TailscaleCliEnvelope, TailscaleError, TailscaleApi>
): Effect.Effect<TailscaleCliEnvelope, never, TailscaleApi> =>
  program.pipe(
    Effect.match({
      onFailure: (error) => errorToEnvelope(command, error),
      onSuccess: (envelope) => envelope,
    })
  )

const root = (command: string): Effect.Effect<SuccessEnvelope<RootResult>, never, TailscaleApi> =>
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
      onSuccess: (result) =>
        successEnvelope({
          command,
          result: {
            name: 'tailscale',
            description: 'Agent-first Tailscale CLI',
            commands: commandTree,
            health: {
              configured: true,
              reachable: result.backendState === 'Running',
              backendState: result.backendState,
              peerCount: result.peerCount,
              exitNodeCount: result.exitNodeCount,
              currentExitNode: result.currentExitNode?.hostName ?? result.currentExitNode?.dnsName,
            },
          },
        }),
    })
  )

const limitFromArgs = (args: ReadonlyArray<string>) =>
  parseFlags(args, [limitFlag]).pipe(
    Effect.flatMap((parsed) => {
      const value = parsed.values.get(limitFlag)
      return value === undefined ? Effect.succeed(defaultLimit) : parseInteger(value, 'limit')
    })
  )

const limitCommand = <Result extends TailscaleCliResult>(
  command: string,
  args: ReadonlyArray<string>,
  program: (limit: number) => Effect.Effect<Result, TailscaleError, TailscaleApi>
) => recoverEnvelope(command, limitFromArgs(args).pipe(Effect.flatMap((limit) => wrap(command, program(limit)))))

const targetCommand = <Result extends TailscaleCliResult>(
  command: string,
  rest: ReadonlyArray<string>,
  label: string,
  program: (target: string) => Effect.Effect<Result, TailscaleError, TailscaleApi>
) =>
  recoverEnvelope(
    command,
    Effect.gen(function* () {
      const parsed = yield* parseFlags(rest, [])
      const [target] = parsed.positionals
      if (target === undefined) {
        return yield* wrap(command, Effect.fail(cliUsageError(`${label} is required`)))
      }
      return yield* wrap(command, program(target))
    })
  )

const dispatch = (args: ReadonlyArray<string>): Effect.Effect<TailscaleCliEnvelope, never, TailscaleApi> => {
  const command = commandString(args)
  const [name] = args
  const rest = args.slice(1)
  switch (name) {
    case undefined: {
      return root(command)
    }
    case 'status': {
      return limitCommand(command, rest, (limit) => status({ limit }))
    }
    case 'peers': {
      return limitCommand(command, rest, (limit) => peers({ limit }))
    }
    case 'exit-nodes': {
      return limitCommand(command, rest, (limit) => exitNodes({ limit }))
    }
    case 'current-exit-node': {
      return wrap(command, currentExitNode)
    }
    case 'dns': {
      return wrap(command, dns)
    }
    case 'ip': {
      return wrap(command, ip)
    }
    case 'whois': {
      return targetCommand(command, rest, 'ip or host', (target) => whois({ target }))
    }
    case 'ping': {
      return targetCommand(command, rest, 'host', (target) => ping({ target }))
    }
    default: {
      return wrap(command, Effect.fail(cliUsageError(`Unknown command ${name}`)))
    }
  }
}

export const executeTailscale = (
  args: ReadonlyArray<string>
): Effect.Effect<TailscaleCliEnvelope, never, TailscaleApi> => dispatch(args)
